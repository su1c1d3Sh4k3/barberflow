"use server";
import { asaasFetch } from "./client";

export async function createSubscription(data: {
  customer: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
  value: number;
  cycle: "MONTHLY";
  description: string;
  externalReference?: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode?: string;
    addressNumber?: string;
    phone?: string;
  };
  remoteIp?: string;
}) {
  return asaasFetch({ method: "POST", path: "/subscriptions", body: data });
}

export async function cancelSubscription(subscriptionId: string) {
  return asaasFetch({ method: "DELETE", path: `/subscriptions/${subscriptionId}` });
}

export async function getSubscriptionPayments(subscriptionId: string) {
  return asaasFetch({ path: `/subscriptions/${subscriptionId}/payments` });
}
