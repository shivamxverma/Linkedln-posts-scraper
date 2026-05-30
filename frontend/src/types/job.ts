export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  applyUrl: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  status?: string | null;
  platform?: string | null;
  notes?: string | null;
  appliedAt?: string | null;
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
