// Exact runtime validation of trained parameters, with held-out histories.
import {
  default_w,
  fsrs,
  createEmptyCard,
  checkParameters,
  dateDiffInDays,
} from "../web/vendor/ts-fsrs.mjs";
import { readFileSync } from "node:fs";
if (process.argv.includes("--evaluate")) {
  const { groups, baseline, candidate } = JSON.parse(readFileSync(0, "utf8"));
  function evaluate(weights) {
    checkParameters(weights);
    const scheduler = fsrs({
      w: weights,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: ["1m", "10m"],
      relearning_steps: ["10m"],
    });
    let loss = 0,
      count = 0;
    for (const logs of Object.values(groups)) {
      let card = createEmptyCard(new Date(logs[0].at));
      for (const log of logs) {
        const now = new Date(log.at);
        if (card.last_review && dateDiffInDays(card.last_review, now) > 0) {
          const p = Math.max(
            1e-7,
            Math.min(
              1 - 1e-7,
              scheduler.forgetting_curve(
                dateDiffInDays(card.last_review, now),
                card.stability,
              ),
            ),
          );
          loss -= Math.log(log.rating === 1 ? 1 - p : p);
          count++;
        }
        card = scheduler.next(card, now, log.rating).card;
      }
    }
    if (!count || !Number.isFinite(loss))
      throw new Error("No valid evaluation samples");
    return loss / count;
  }
  console.log(
    JSON.stringify({
      baselineLogLoss: evaluate(baseline),
      candidateLogLoss: evaluate(candidate),
    }),
  );
} else console.log(JSON.stringify(default_w));
