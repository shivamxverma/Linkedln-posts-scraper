import { JobsBoard } from "@/components/jobs-board";
import { listJobs } from "@/lib/jobs-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jobs = await listJobs();
  const fetchedAt = new Date().toISOString();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <p className="hero__label">Live job listings</p>
          <h1>Find the latest roles we&apos;ve scraped into your database.</h1>
          <p className="hero__description">
            A clean, fast view of every saved job, designed so you can scan openings and jump to
            the application in one click.
          </p>
        </div>

        <div className="hero__stats">
          <div className="stat-card">
            <span>Total jobs</span>
            <strong>{jobs.length}</strong>
          </div>
          <div className="stat-card">
            <span>Sources</span>
            <strong>{new Set(jobs.map((job) => job.source)).size}</strong>
          </div>
        </div>
      </section>

      <p className="page-timestamp">Updated {new Date(fetchedAt).toLocaleString("en-US")}</p>
      <JobsBoard jobs={jobs} />
    </main>
  );
}
