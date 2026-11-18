import { type Client } from 'discord.js';
import { Shoukaku, Connectors, type Node, type NodeOption } from 'shoukaku';
import { env, type LavalinkNodeConfig } from '../config/env.js';
import { childLogger } from '../core/logger.js';
import { registerShutdownHook } from '../core/process.js';
import { selectIdealNode, isNodeHealthy, getNodeStateString } from './selector.js';
import { migrateDroppedNodePlayers } from './failover.js';
import {
  type NodeMetadata,
  type NodePreference,
  type LavalinkServiceStats,
  type LavalinkNodeStats,
} from './types.js';

const log = childLogger('lavalink/service');

/**
 * LavalinkService manages the Shoukaku v4 instance, node lifecycle,
 * connection health, role-based node selection, and failover player migration.
 */
export class LavalinkService {
  private shoukaku: Shoukaku | null = null;
  private readonly nodeMeta = new Map<string, NodeMetadata>();
  private preferResidentialForYouTube: boolean;

  constructor(options: { preferResidentialForYouTube?: boolean } = {}) {
    this.preferResidentialForYouTube =
      options.preferResidentialForYouTube ??
      process.env['PREFER_RESIDENTIAL_FOR_YOUTUBE'] !== 'false';
  }

  /**
   * Initializes Shoukaku with the Discord.js client and configured Lavalink nodes.
   * Registers node lifecycle event handlers and graceful shutdown hook.
   */
  public init(client: Client, nodesConfig: LavalinkNodeConfig[] = env.LAVALINK_NODES): Shoukaku {
    if (this.shoukaku) {
      log.warn('LavalinkService.init called when already initialized');
      return this.shoukaku;
    }

    log.info(
      {
        nodeCount: nodesConfig.length,
        preferResidentialForYouTube: this.preferResidentialForYouTube,
      },
      'Initializing Lavalink connection layer with Shoukaku...',
    );

    // Populate node metadata map with roles
    for (const conf of nodesConfig) {
      this.nodeMeta.set(conf.name, {
        name: conf.name,
        host: conf.host,
        port: conf.port,
        role: conf.role,
        secure: conf.secure,
      });
    }

    // Convert config to Shoukaku NodeOption format
    const shoukakuNodes: NodeOption[] = nodesConfig.map((conf) => ({
      name: conf.name,
      url: `${conf.host}:${conf.port}`,
      auth: conf.password,
      secure: conf.secure,
    }));

    // Build Shoukaku instance with session resuming and reconnection backoff
    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      shoukakuNodes,
      {
        resume: true,
        resumeTimeout: 60,
        resumeByLibrary: true,
        reconnectTries: 100,
        reconnectInterval: 5000,
        restTimeout: 10000,
        moveOnDisconnect: false, // We control migration targeted only to affected players
        userAgent: 'RealOpsMusic/1.0.0 (Production Discord Bot)',
        nodeResolver: (nodes) =>
          selectIdealNode(nodes, this.nodeMeta, 'default', this.preferResidentialForYouTube),
      },
    );

    this.registerEventHandlers(this.shoukaku);

    // Register with core process shutdown sequence
    registerShutdownHook('lavalink', async () => {
      await this.destroy();
    });

    log.info('Lavalink connection manager ready');
    return this.shoukaku;
  }

  /**
   * Register structured event listeners for all Lavalink node lifecycle events.
   */
  private registerEventHandlers(shoukaku: Shoukaku): void {
    shoukaku.on('ready', (name: string, lavalinkResume: boolean, libraryResume: boolean) => {
      const meta = this.nodeMeta.get(name);
      log.info(
        {
          node: name,
          role: meta?.role ?? 'unknown',
          lavalinkResume,
          libraryResume,
        },
        'Lavalink node connected and ready',
      );
    });

    shoukaku.on('error', (name: string, error: Error) => {
      log.error(
        {
          node: name,
          role: this.nodeMeta.get(name)?.role,
          err: error,
        },
        'Lavalink node encountered error',
      );
    });

    shoukaku.on('close', (name: string, code: number, reason: string) => {
      log.warn(
        {
          node: name,
          role: this.nodeMeta.get(name)?.role,
          code,
          reason,
        },
        'Lavalink node connection closed',
      );

      // Trigger failover for players on this node
      void migrateDroppedNodePlayers(shoukaku, this.nodeMeta, name).catch((err) => {
        log.error({ node: name, err }, 'Unhandled error during node close failover');
      });
    });

    shoukaku.on('disconnect', (name: string, count: number) => {
      log.warn(
        {
          node: name,
          role: this.nodeMeta.get(name)?.role,
          count,
        },
        'Lavalink node disconnected',
      );

      // Trigger failover for players on this node
      void migrateDroppedNodePlayers(shoukaku, this.nodeMeta, name).catch((err) => {
        log.error({ node: name, err }, 'Unhandled error during node disconnect failover');
      });
    });

    shoukaku.on('reconnecting', (name: string, reconnectsLeft: number, reconnectInterval: number) => {
      log.info(
        {
          node: name,
          role: this.nodeMeta.get(name)?.role,
          reconnectsLeft,
          reconnectIntervalMs: reconnectInterval,
        },
        'Lavalink node reconnecting...',
      );
    });

    shoukaku.on('debug', (name: string, info: string) => {
      log.trace({ node: name, info }, 'Lavalink debug trace');
    });
  }

  /**
   * Selects and returns an optimal healthy Lavalink Node based on load and preference.
   * Throws Error if no healthy nodes are currently available.
   */
  public getNode(preference: NodePreference = 'default'): Node {
    if (!this.shoukaku) {
      throw new Error('LavalinkService is not initialized. Call init() first.');
    }

    const node = selectIdealNode(
      this.shoukaku.nodes,
      this.nodeMeta,
      preference,
      this.preferResidentialForYouTube,
    );

    if (!node) {
      log.error({ preference }, 'No healthy Lavalink nodes available');
      throw new Error(`No healthy Lavalink nodes available for preference "${preference}"`);
    }

    return node;
  }

  /**
   * Checks whether Lavalink is healthy.
   * If `name` is provided, checks that specific node.
   * If `name` is omitted, checks whether at least one node is healthy.
   */
  public isHealthy(name?: string): boolean {
    if (!this.shoukaku) return false;

    if (name) {
      const node = this.shoukaku.nodes.get(name);
      return node ? isNodeHealthy(node) : false;
    }

    return [...this.shoukaku.nodes.values()].some(isNodeHealthy);
  }

  /**
   * Collects detailed telemetry and operational statistics across all configured nodes.
   */
  public stats(): LavalinkServiceStats {
    if (!this.shoukaku) {
      return {
        healthy: false,
        totalNodes: this.nodeMeta.size,
        connectedNodes: 0,
        totalPlayers: 0,
        nodes: [],
      };
    }

    const nodeStatsList: LavalinkNodeStats[] = [];

    for (const [name, meta] of this.nodeMeta.entries()) {
      const node = this.shoukaku.nodes.get(name);
      if (!node) {
        nodeStatsList.push({
          name,
          role: meta.role,
          state: 'UNKNOWN',
          isHealthy: false,
          penalties: Infinity,
          players: 0,
          playingPlayers: 0,
          uptime: 0,
          memory: null,
          cpu: null,
        });
        continue;
      }

      const healthy = isNodeHealthy(node);
      nodeStatsList.push({
        name,
        role: meta.role,
        state: getNodeStateString(node.state),
        isHealthy: healthy,
        penalties: healthy ? node.penalties : Infinity,
        players: node.stats?.players ?? 0,
        playingPlayers: node.stats?.playingPlayers ?? 0,
        uptime: node.stats?.uptime ?? 0,
        memory: node.stats?.memory ?? null,
        cpu: node.stats?.cpu ?? null,
      });
    }

    const connectedNodes = nodeStatsList.filter((n) => n.isHealthy).length;

    return {
      healthy: connectedNodes > 0,
      totalNodes: this.nodeMeta.size,
      connectedNodes,
      totalPlayers: this.shoukaku.players.size,
      nodes: nodeStatsList,
    };
  }

  /**
   * Get the underlying Shoukaku instance.
   */
  public getShoukaku(): Shoukaku {
    if (!this.shoukaku) {
      throw new Error('LavalinkService is not initialized');
    }
    return this.shoukaku;
  }

  /**
   * Updates the YouTube residential node preference at runtime.
   */
  public setPreferResidentialForYouTube(enabled: boolean): void {
    this.preferResidentialForYouTube = enabled;
    log.info({ preferResidentialForYouTube: enabled }, 'Updated YouTube node preference policy');
  }

  /**
   * Cleanly disconnects all nodes and players during application shutdown.
   */
  public async destroy(): Promise<void> {
    if (!this.shoukaku) return;

    log.info('Destroying Lavalink connection layer and closing nodes...');

    try {
      // Disconnect all voice connections handled by Shoukaku
      for (const [guildId, player] of this.shoukaku.players.entries()) {
        try {
          await player.destroy();
        } catch (err) {
          log.warn({ guildId, err }, 'Failed to cleanly destroy player during shutdown');
        }
      }

      // Disconnect all node WebSockets
      for (const [name, node] of this.shoukaku.nodes.entries()) {
        try {
          node.disconnect(1000, 'Bot graceful shutdown');
        } catch (err) {
          log.warn({ node: name, err }, 'Failed to cleanly disconnect node during shutdown');
        }
      }

      log.info('Lavalink connection layer cleanly shut down');
    } catch (err) {
      log.error({ err }, 'Error during Lavalink shutdown');
    } finally {
      this.shoukaku = null;
    }
  }
}

// Export singleton instance for convenience
export const lavalinkService = new LavalinkService();

