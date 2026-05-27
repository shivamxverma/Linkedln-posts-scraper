export interface SearchConfig {
  role: string;
  location: string;
  page?: number;
}

export interface RawJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  jobUrl: string;
}

export interface Job {
  source: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  applyUrl: string;
}
