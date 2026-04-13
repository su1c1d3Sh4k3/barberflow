"use server";
import { asaasFetch } from "./client";

export interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode?: string;
  addressNumber?: string;
  phone?: string;
}

export async function createPayment(data: {
  customer: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
  value: number;
  dueDate: string;
  description: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
  creditCard?: CreditCardData;
  creditCardHolderInfo?: CreditCardHolderInfo;
  remoteIp?: string;
}) {
  return asaasFetch({ method: "POST", path: "/payments", body: data });
}

export async function getPayment(paymentId: string) {
  return asaasFetch({ path: `/payments/${paymentId}` });
}

export async function getPixQrCode(paymentId: string) {
  return asaasFetch({ path: `/payments/${paymentId}/pixQrCode` });
}
