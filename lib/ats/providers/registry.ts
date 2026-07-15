import type { AtsProvider, AtsProviderKey } from "../types";

export const atsProviders: AtsProvider[] = [];

export function getAtsProvider(
  providerKey: AtsProviderKey,
): AtsProvider | undefined {
  return atsProviders.find((provider) => provider.key === providerKey);
}
