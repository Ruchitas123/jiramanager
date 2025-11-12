declare module "ldapts" {
  export class Client {
    constructor(options: { url: string });
    bind(dn: string, password: string): Promise<void>;
    search(base: string, options: any): Promise<{ searchEntries: any[] }>;
    modify(dn: string, change: any): Promise<void>;
    startTLS(): Promise<void>;
    unbind(): Promise<void>;
  }

  export class Change {
    constructor(args: any);
  }

  export class Attribute {
    constructor(args: any);
  }
} 