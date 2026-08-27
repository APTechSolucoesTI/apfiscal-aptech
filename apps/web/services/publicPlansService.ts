import { backendFetch } from "@/lib/backend";

export interface PublicSubscriptionPlan {
  key: string;
  name: string;
  description: string | null;
  price_label: string;
  highlighted: boolean;
  max_users: number | null;
  max_companies: number | null;
  max_monthly_documents: number | null;
  max_totvs_connections: number | null;
  features: Record<string, boolean> | null;
  sort_order: number;
}

export async function getPublicPlans(): Promise<PublicSubscriptionPlan[]> {
  const response = await backendFetch<{ plans: PublicSubscriptionPlan[] }>("/public/plans");
  return response.plans;
}
