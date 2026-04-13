"use server";
import { asaasFetch } from "./client";

export async function createCustomer(data: {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}) {
  return asaasFetch({ method: "POST", path: "/customers", body: data });
}

export async function getCustomer(customerId: string) {
  return asaasFetch({ path: `/customers/${customerId}` });
}
