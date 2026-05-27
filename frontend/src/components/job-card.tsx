import type { Job } from "@/types/job";

type JobCardProps = {
  job: Job;
};

function formatPostedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function JobCard({ job }: JobCardProps) {
  return (
    <article className="job-card">
      <div className="job-card__eyebrow">
        <span>{job.source}</span>
        <span>Updated {formatPostedDate(job.updatedAt)}</span>
      </div>

      <div className="job-card__content">
        <div>
          <h2>{job.title}</h2>
          <p className="job-card__company">{job.company}</p>
        </div>

        <div className="job-card__meta">
          <span>{job.location}</span>
          <span>{job.salary ?? "Salary not listed"}</span>
        </div>
      </div>

      <div className="job-card__footer">
        <a href={job.applyUrl} target="_blank" rel="noreferrer">
          Apply now
        </a>
      </div>
    </article>
  );
}
