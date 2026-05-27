"use client";

import { useMemo, useState } from "react";

import { JobCard } from "@/components/job-card";
import type { Job } from "@/types/job";

type JobsBoardProps = {
  jobs: Job[];
};

export function JobsBoard({ jobs }: JobsBoardProps) {
  const [query, setQuery] = useState("");

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return jobs;
    }

    return jobs.filter((job) =>
      [job.title, job.company, job.location, job.source].some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [jobs, query]);

  return (
    <section className="jobs-section">
      <div className="jobs-section__header">
        <div>
          <p className="section-kicker">All listings</p>
          <h2>Fresh from PostgreSQL</h2>
        </div>

        <div className="jobs-toolbar">
          <label className="jobs-search" htmlFor="job-search">
            <span>Search jobs</span>
            <input
              id="job-search"
              name="job-search"
              type="search"
              placeholder="Title, company, location, source"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="jobs-section__summary">{filteredJobs.length} matching roles</p>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <h3>No matching jobs</h3>
          <p>Try a different keyword or clear the search to see every role in the database.</p>
        </div>
      ) : (
        <div className="jobs-grid">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </section>
  );
}
