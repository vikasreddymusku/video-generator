import type {
  BrandingConfig,
  BrandingOverride,
  ResolvedBranding,
} from "../automation/types";

export const stages = [
  "PLANNING",
  "GENERATING_VOICE",
  "ALIGNING_TIMING",
  "RENDERING",
  "VALIDATING",
] as const;
export type Status =
  | "SCHEDULED"
  | "QUEUED"
  | (typeof stages)[number]
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";
export type SourceType =
  | "MARKDOWN"
  | "TEXT"
  | "PDF"
  | "DOCX"
  | "PPTX"
  | "WEBPAGE";
export interface SourceSection {
  heading: string;
  text: string;
  page?: number;
  slide?: number;
}
export interface NormalizedSource {
  sourceType: SourceType;
  sourceReference: string;
  originalName: string;
  title: string;
  content: string;
  sections: SourceSection[];
  provenance: {
    reference: string;
    extractedAt: string;
    pageCount?: number;
    slideCount?: number;
    assets: { name: string; bytes: number }[];
    warnings: string[];
  };
}
export interface Job {
  id: string;
  sourceType: SourceType;
  sourceLocationType: "LOCAL" | "REMOTE";
  sourceReference: string;
  sourceOriginalName: string;
  sourceMimeType: string;
  title: string;
  status: Status;
  scheduledAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  theme: string;
  durationMode: "auto" | "fixed";
  durationSeconds?: number;
  actualDuration?: number;
  errorStage: string | null;
  errorMessage: string | null;
  attempt: number;
  branding?: ResolvedBranding;
  brandingOverride?: BrandingOverride;
}
export interface JobEvent {
  id: number;
  jobId: string;
  stage: string;
  status: string;
  message: string;
  createdAt: string;
  attempt: number;
}
export interface Settings {
  theme: string;
  durationMode: "auto" | "fixed";
  durationSeconds?: number;
  concurrency: number;
  autoStart: boolean;
}
export interface SettingsView extends Settings {
  themes: { id: string; name: string }[];
  plannerConfigured: boolean;
  voiceConfigured: boolean;
  voiceIdConfigured: boolean;
  plannerModel: string;
  voiceModel: string;
  workerPaused: boolean;
  storage: string;
  output: string;
  timezone: string;
  offline: boolean;
}
export interface BrandingView {
  brand: {
    name: string;
    tagline: string;
    cta: string;
    website: string;
    email: string;
    phone: string;
    address: string;
  };
  branding: BrandingConfig;
}
