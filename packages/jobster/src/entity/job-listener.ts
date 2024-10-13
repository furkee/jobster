/**
 * Entity interface for job listener table that stores the active instances
 * of jobster that are connected to the current DB and the events they are
 * listening to
 */
export type JobsterJobListener = {
  id: string;
  payload: {
    /** jobs listened by the jobster instance */
    jobNames: string[];
  };
  createdAt: Date;
  updatedAt: Date;
};
