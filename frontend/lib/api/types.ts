/** Friendly names for the generated API schema (source of truth: backend/openapi.yaml). */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Trip = Schemas["TripResponse"];
export type PlanTripRequest = Schemas["PlanTripRequest"];
export type Place = Schemas["Place"];
export type Stop = Schemas["Stop"];
export type DailyLog = Schemas["DailyLog"];
export type Segment = Schemas["Segment"];
export type Bracket = Schemas["Bracket"];
export type Remark = Schemas["Remark"];
export type Recap = Schemas["Recap"];
export type RuleCheck = Schemas["RuleCheck"];
export type LogHeader = Schemas["LogHeader"];
export type DutyStatus = Schemas["StatusEnum"];
export type StopKind = Schemas["KindEnum"];
export type ApiErrorBody = Schemas["ErrorBody"];
