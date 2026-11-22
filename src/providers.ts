/**
 * Provider registry for mcp-cloud-explorer.
 *
 * Every provider exposes the SAME normalized dataset shape, so the four
 * tools in index.ts never branch on a cloud. Each provider keeps its own
 * native naming inside the data: service names (Amazon EC2 / Azure Virtual
 * Machines / Google Compute Engine / OCI Compute), region names, sizes,
 * and per-resource fields are whatever that cloud calls them.
 *
 * All datasets are LOCAL MOCK DATA - synthetic JSON, no real accounts,
 * no credentials, no network calls.
 */

import awsRaw from "./data/mock-aws.json" with { type: "json" };
import azureRaw from "./data/mock-azure.json" with { type: "json" };
import gcpRaw from "./data/mock-gcp.json" with { type: "json" };
import ociRaw from "./data/mock-oci.json" with { type: "json" };

export const PROVIDER_IDS = ["aws", "azure", "gcp", "oci"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ResourceKind = "compute" | "storage" | "functions" | "database";
export const RESOURCE_KINDS: ResourceKind[] = [
  "compute",
  "storage",
  "functions",
  "database",
];

export interface CloudResource {
  kind: ResourceKind;
  /** Native service name, e.g. "Amazon S3", "Azure Blob Storage". */
  service: string;
  name: string;
  region: string;
  /** Unified idle signal: days since the resource was last used. */
  lastActivityDaysAgo: number;
  [key: string]: unknown;
}

export interface CostRow {
  service: string;
  currentMonthUsd: number;
  previousMonthUsd: number;
}

export interface ProviderData {
  id: ProviderId;
  displayName: string;
  /** What the provider calls the billing boundary: account, subscription, project, tenancy. */
  accountKind: string;
  accountId: string;
  generatedFor: string;
  serviceNames: Record<ResourceKind, string>;
  resources: CloudResource[];
  costByService: CostRow[];
}

/**
 * The AWS dataset predates the normalized schema (it is the fullest one),
 * so it is adapted here: its S3 buckets and Lambda functions keep every
 * original field, and the EC2 / RDS records join them in the same shape.
 */
function adaptAws(): ProviderData {
  const resources: CloudResource[] = [
    ...awsRaw.ec2Instances.map((i) => ({
      kind: "compute" as const,
      service: "Amazon EC2",
      ...i,
    })),
    ...awsRaw.s3Buckets.map((b) => ({
      kind: "storage" as const,
      service: "Amazon S3",
      lastActivityDaysAgo: b.lastAccessedDaysAgo,
      ...b,
    })),
    ...awsRaw.lambdaFunctions.map((f) => ({
      kind: "functions" as const,
      service: "AWS Lambda",
      lastActivityDaysAgo: f.lastInvokedDaysAgo,
      ...f,
    })),
    ...awsRaw.rdsDatabases.map((d) => ({
      kind: "database" as const,
      service: "Amazon RDS",
      ...d,
    })),
  ];
  return {
    id: "aws",
    displayName: "Amazon Web Services",
    accountKind: "account",
    accountId: awsRaw.accountId,
    generatedFor: awsRaw.generatedFor,
    serviceNames: {
      compute: "Amazon EC2",
      storage: "Amazon S3",
      functions: "AWS Lambda",
      database: "Amazon RDS",
    },
    resources,
    costByService: awsRaw.costByService,
  };
}

/** The on-disk schema of the three normalized dataset files. */
interface RawProviderFile {
  displayName: string;
  accountKind: string;
  accountId: string;
  generatedFor: string;
  serviceNames: Record<ResourceKind, string>;
  resources: CloudResource[];
  costByService: CostRow[];
}

function asProvider(raw: unknown, id: ProviderId): ProviderData {
  const r = raw as RawProviderFile;
  return {
    id,
    displayName: r.displayName,
    accountKind: r.accountKind,
    accountId: r.accountId,
    generatedFor: r.generatedFor,
    serviceNames: r.serviceNames,
    resources: r.resources,
    costByService: r.costByService,
  };
}

export const PROVIDERS: Record<ProviderId, ProviderData> = {
  aws: adaptAws(),
  azure: asProvider(azureRaw, "azure"),
  gcp: asProvider(gcpRaw, "gcp"),
  oci: asProvider(ociRaw, "oci"),
};

export function getProvider(id: ProviderId): ProviderData {
  return PROVIDERS[id];
}
