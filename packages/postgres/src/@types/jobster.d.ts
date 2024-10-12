declare module '@jobster/core' {
  interface JobsterTypes {
    transaction: import('pg').PoolClient;
    jobNames: 'job1' | 'job2';
  }
}

export {};
