import type { Job } from "@/types/job";

type JobCardProps = {
  job: Job;
  onTrack?: (job: Job) => void;
  onSelect?: (job: Job) => void;
};

export function getStatusStyle(status: string) {
  switch (status) {
    case "Applied":
      return { bg: "#fef3c7", text: "#b45309", label: "Applied" };
    case "Followed Up":
      return { bg: "#e0e7ff", text: "#4338ca", label: "Followed Up" };
    case "Interview Scheduled":
      return { bg: "#e0f2fe", text: "#0369a1", label: "Interview" };
    case "Rejected":
      return { bg: "#fee2e2", text: "#b91c1c", label: "Rejected" };
    case "Offer":
      return { bg: "#d1fae5", text: "#047857", label: "Offer" };
    default:
      return { bg: "#f1f5f9", text: "#475569", label: status };
  }
}

function formatPostedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function JobCard({ job, onTrack, onSelect }: JobCardProps) {
  return (
    <article 
      className="job-card"
      onClick={() => onSelect?.(job)}
      style={{ cursor: "pointer", transition: "transform 150ms ease, box-shadow 150ms ease" }}
    >
      <div className="job-card__eyebrow">
        <span className="source-label">{job.source}</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {job.status && (
            <span
              className="status-badge"
              style={{
                background: getStatusStyle(job.status).bg,
                color: getStatusStyle(job.status).text,
                padding: "0.15rem 0.55rem",
                borderRadius: "999px",
                fontWeight: 600,
                fontSize: "0.68rem",
                textTransform: "none",
                letterSpacing: "normal",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                display: "inline-flex",
                alignItems: "center"
              }}
            >
              {getStatusStyle(job.status).label}
            </span>
          )}
          <span>Updated {formatPostedDate(job.updatedAt)}</span>
        </div>
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

      <div className="job-card__footer" onClick={(e) => e.stopPropagation()}>
        {job.applyUrl ? (
          <a href={job.applyUrl} target="_blank" rel="noreferrer">
            Apply now
          </a>
        ) : (
          <span className="no-apply-link">No link</span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrack?.(job);
          }}
          className="track-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            padding: "0.65rem 1.15rem",
            borderRadius: "999px",
            background: job.status ? "rgba(49, 37, 24, 0.05)" : "transparent",
            color: "var(--text)",
            fontSize: "0.92rem",
            fontWeight: 500,
            border: "1px solid var(--border)",
            cursor: "pointer",
            transition: "all 180ms ease",
            fontFamily: "inherit",
          }}
        >
          {job.status ? "Update Status" : "Track"}
        </button>
      </div>
    </article>
  );
}
