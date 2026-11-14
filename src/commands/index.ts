import type { Command } from "../types/index.js";
import { playCommand } from "./play.js";
import { pauseCommand } from "./pause.js";
import { resumeCommand } from "./resume.js";
import { skipCommand } from "./skip.js";
import { previousCommand } from "./previous.js";
import { stopCommand } from "./stop.js";
import { seekCommand } from "./seek.js";
import { volumeCommand } from "./volume.js";
import { nowPlayingCommand } from "./nowplaying.js";
import { queueCommand } from "./queue.js";
import { shuffleCommand } from "./shuffle.js";
import { loopCommand } from "./loop.js";
import { clearCommand } from "./clear.js";
import { removeCommand } from "./remove.js";
import { moveCommand } from "./move.js";
import { jumpCommand } from "./jump.js";
import { filterCommand } from "./filter.js";
import { lyricsCommand } from "./lyrics.js";
import { autoplayCommand } from "./autoplay.js";
import { mode247Command } from "./mode247.js";
import { helpCommand } from "./help.js";

export const allCommands: Command[] = [
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  previousCommand,
  stopCommand,
  seekCommand,
  volumeCommand,
  nowPlayingCommand,
  queueCommand,
  shuffleCommand,
  loopCommand,
  clearCommand,
  removeCommand,
  moveCommand,
  jumpCommand,
  filterCommand,
  lyricsCommand,
  autoplayCommand,
  mode247Command,
  helpCommand,
];

