export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  applyUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type JobsResponse = {
  success: boolean;
  message: string;
  data: {
    jobs: Job[];
  };
  meta: {
    total: number;
    fetchedAt: string;
  };
};

export type JobsErrorResponse = {
  success: false;
  message: string;
};
