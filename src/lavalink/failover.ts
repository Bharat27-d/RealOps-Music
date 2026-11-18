import { type Shoukaku, type Player } from 'shoukaku';
import { childLogger } from '../core/logger.js';
import { selectIdealNode } from './selector.js';
import { type NodeMetadata, type PlayerMigrationResult } from './types.js';

const log = childLogger('lavalink/failover');

/**
 * Handles failover migration when a Lavalink node disconnects or closes.
 * Finds all players hosted on the dropped node and migrates them to another
 * healthy node, resuming audio from the last known playback position.
 *
 * @param shoukaku Active Shoukaku manager instance
 * @param nodeMeta Map of node metadata
 * @param droppedNodeName Name of the node that dropped
 */
export async function migrateDroppedNodePlayers(
  shoukaku: Shoukaku,
  nodeMeta: Map<string, NodeMetadata>,
  droppedNodeName: string,
): Promise<PlayerMigrationResult[]> {
  const affectedPlayers = [...shoukaku.players.values()].filter(
    (player) => player.node.name === droppedNodeName,
  );

  if (affectedPlayers.length === 0) {
    log.debug(
      { droppedNode: droppedNodeName },
      'No active players were on the dropped node — no migration needed',
    );
    return [];
  }

  log.warn(
    {
      droppedNode: droppedNodeName,
      affectedPlayerCount: affectedPlayers.length,
      guildIds: affectedPlayers.map((p) => p.guildId),
    },
    'Lavalink node dropped — beginning failover player migration',
  );

  const results: PlayerMigrationResult[] = [];

  for (const player of affectedPlayers) {
    const result = await migratePlayer(shoukaku, nodeMeta, player, droppedNodeName);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  log.info(
    {
      droppedNode: droppedNodeName,
      total: affectedPlayers.length,
      successful: successCount,
      failed: affectedPlayers.length - successCount,
    },
    'Failover player migration finished',
  );

  return results;
}

/**
 * Migrates a single player from a failed node to a healthy target node.
 */
async function migratePlayer(
  shoukaku: Shoukaku,
  nodeMeta: Map<string, NodeMetadata>,
  player: Player,
  droppedNodeName: string,
): Promise<PlayerMigrationResult> {
  const guildId = player.guildId;
  const lastPosition = player.position;
  const track = player.track;

  // Select a healthy replacement node (excluding the dropped node)
  const targetNode = selectIdealNode(shoukaku.nodes, nodeMeta, 'default');

  if (!targetNode || targetNode.name === droppedNodeName) {
    const err = new Error('No alternative healthy Lavalink nodes available for failover');
    log.error(
      {
        guildId,
        droppedNode: droppedNodeName,
        position: lastPosition,
        err,
      },
      'Failover failed: No healthy target node available',
    );
    return {
      guildId,
      fromNode: droppedNodeName,
      toNode: 'none',
      position: lastPosition,
      success: false,
      error: err,
    };
  }

  log.info(
    {
      guildId,
      fromNode: droppedNodeName,
      toNode: targetNode.name,
      lastPosition,
      hasTrack: Boolean(track),
    },
    'Migrating player to healthy node...',
  );

  try {
    // Strategy 1: Standard Shoukaku player.move()
    const moved = await player.move(targetNode.name);

    if (moved) {
      log.info(
        { guildId, fromNode: droppedNodeName, toNode: targetNode.name, position: player.position },
        'Player successfully migrated and resumed via player.move()',
      );
      return {
        guildId,
        fromNode: droppedNodeName,
        toNode: targetNode.name,
        position: lastPosition,
        success: true,
      };
    }
  } catch (moveErr) {
    log.warn(
      { guildId, fromNode: droppedNodeName, toNode: targetNode.name, err: moveErr },
      'Standard player.move() failed (likely due to dead old node) — attempting manual reconnect resume',
    );
  }

  // Strategy 2: Manual failover recovery if old node REST is completely unreachable
  try {
    const connection = shoukaku.connections.get(guildId);
    if (!connection) {
      throw new Error(`Voice connection not found for guild ${guildId}`);
    }

    // Point player to the new node
    player.node = targetNode;

    // Send voice server update to the new node
    await player.sendServerUpdate(connection);

    // If a track was actively playing, resume from last known position
    if (track) {
      await player.resume({ position: lastPosition });
    }

    log.info(
      { guildId, fromNode: droppedNodeName, toNode: targetNode.name, position: lastPosition },
      'Player successfully resumed on new node via manual failover recovery',
    );

    return {
      guildId,
      fromNode: droppedNodeName,
      toNode: targetNode.name,
      position: lastPosition,
      success: true,
    };
  } catch (manualErr) {
    const error = manualErr instanceof Error ? manualErr : new Error(String(manualErr));
    log.error(
      {
        guildId,
        fromNode: droppedNodeName,
        toNode: targetNode.name,
        position: lastPosition,
        err: error,
      },
      'All failover migration strategies failed for player',
    );

    return {
      guildId,
      fromNode: droppedNodeName,
      toNode: targetNode.name,
      position: lastPosition,
      success: false,
      error,
    };
  }
}

