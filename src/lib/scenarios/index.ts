// The scenario catalogue: every real-world situation Aerar is built for, grouped by problem.
import { duplicate } from "./catalog/duplicate";
import { evidence } from "./catalog/evidence";
import { injection } from "./catalog/injection";
import { intent } from "./catalog/intent";
import { mismatch } from "./catalog/mismatch";
import { oversight } from "./catalog/oversight";
import { runaway } from "./catalog/runaway";
import type { Scenario } from "./stage";

export { PROBLEMS, type ProblemId, type Scenario, type ScenarioResult } from "./stage";

export const SCENARIOS: Scenario[] = [...intent, ...injection, ...duplicate, ...mismatch, ...evidence, ...oversight, ...runaway];
