// The scenario catalogue: every real-world situation Aerar is built for, grouped by problem.
import { duplicate } from "./catalog/duplicate";
import { injection } from "./catalog/injection";
import type { Scenario } from "./stage";

export { PROBLEMS, type ProblemId, type Scenario, type ScenarioResult } from "./stage";

export const SCENARIOS: Scenario[] = [...injection, ...duplicate];
