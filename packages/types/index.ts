export interface Store {
  id: string;
  name: string;
  slug: string;
  locale: "es" | "en";
}
export interface Product {
  id: string;
  storeId: string;
  name: string;
  price: string;
}
