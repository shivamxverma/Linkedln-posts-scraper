import { JobsBoard } from "@/components/jobs-board";
import { listJobs } from "@/lib/jobs-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jobs = await listJobs();
  const fetchedAt = new Date().toISOString();
  const sourceCount = new Set(jobs.map((job) => job.source)).size;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-kicker">Live job listings</p>
          <h1>Job board</h1>
          <p className="page-timestamp">Updated {new Date(fetchedAt).toLocaleString("en-US")}</p>
        </div>

        <div className="page-metrics" aria-label="Job board metrics">
          <span>
            <strong>{jobs.length}</strong>
            jobs
          </span>
          <span>
            <strong>{sourceCount}</strong>
            sources
          </span>
        </div>
      </header>

      <JobsBoard jobs={jobs} />
    </main>
  );
}
