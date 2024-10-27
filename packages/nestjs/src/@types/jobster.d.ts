declare module "@jobster/core" {
  interface JobsterTypes {
    transaction: import("@mikro-orm/postgresql").EntityManager;
    jobNames: "test";
  }
}

export {};
