import { useQuery } from "@tanstack/react-query";
import { storesApi } from "../api/stores.api";

export function useMyStores() {
  return useQuery({
    queryKey: ["stores", "mine"],
    queryFn: storesApi.listMine,
  });
}
