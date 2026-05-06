import { getActiveEditable } from "../insertion/editable";

export interface SiteAdapter {
  id: string;
  canRun(): boolean;
  isDisabled(host: string, disabledHosts: string[]): boolean;
  getHost(): string;
}

export class GenericSiteAdapter implements SiteAdapter {
  id = "generic";
  canRun(): boolean {
    return Boolean(getActiveEditable());
  }
  isDisabled(host: string, disabledHosts: string[]): boolean {
    return disabledHosts.includes(host);
  }
  getHost(): string {
    return location.hostname;
  }
}

export const genericSiteAdapter = new GenericSiteAdapter();
