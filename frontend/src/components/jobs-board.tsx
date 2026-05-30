"use client";

import { useMemo, useState, useEffect } from "react";

import { JobCard, getStatusStyle } from "@/components/job-card";
import type { Job } from "@/types/job";

type JobsBoardProps = {
  jobs: Job[];
};

export function JobsBoard({ jobs: initialJobs }: JobsBoardProps) {
  // Main reactive database state
  const [allJobs, setAllJobs] = useState<Job[]>(initialJobs);

  // Layout Tab State: "explore", "tracker", or "queue"
  const [activeTab, setActiveTab] = useState<"explore" | "tracker" | "queue">("explore");

  // Search & Filter state for Explore
  const [query, setQuery] = useState("");
  const [entryLevelOnly, setEntryLevelOnly] = useState(true);

  // Search & Filter state for Tracker
  const [trackerQuery, setTrackerQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals state
  const [selectedJobForTrack, setSelectedJobForTrack] = useState<Job | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tracking Form Fields
  const [trackStatus, setTrackStatus] = useState("Applied");
  const [trackPlatform, setTrackPlatform] = useState("");
  const [trackNotes, setTrackNotes] = useState("");

  // Manual Creation Fields
  const [manualTitle, setManualTitle] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualSalary, setManualSalary] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPlatform, setManualPlatform] = useState("College");
  const [manualStatus, setManualStatus] = useState("Applied");
  const [manualNotes, setManualNotes] = useState("");

  // Inline dropdown status state (which job ID is currently opening the inline picker)
  const [activeInlineDropdownId, setActiveInlineDropdownId] = useState<string | null>(null);

  // Auto Apply & Job Details Drawer States
  const [selectedJobDetails, setSelectedJobDetails] = useState<Job | null>(null);
  const [activeApplication, setActiveApplication] = useState<any | null>(null);
  const [pollingStatus, setPollingStatus] = useState<"IDLE" | "POLLING" | "SUCCESS" | "FAILED">("IDLE");
  const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Cleans up any running polling loops on unmount or drawer swap
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  // Applications Queue States
  const [applications, setApplications] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  const fetchApplications = async () => {
    setIsLoadingApps(true);
    try {
      const res = await fetch("/api/v1/applications");
      const json = await res.json();
      if (json.success) {
        setApplications(json.data.applications);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingApps(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  // Poll applications list if any application is currently in-progress
  useEffect(() => {
    const hasInProgress = applications.some((app) => 
      ["QUEUED", "GENERATING_RESUME", "READY_TO_APPLY", "APPLYING"].includes(app.status)
    );

    if (hasInProgress) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/v1/applications");
          const json = await res.json();
          if (json.success) {
            setApplications(json.data.applications);
          }
        } catch (err) {
          console.error(err);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [applications]);

  // Triggers the background auto apply worker pipeline
  const handleAutoApply = async (jobId: string) => {
    if (pollingStatus === "POLLING") return;

    setPollingStatus("POLLING");
    setActiveApplication(null);

    try {
      const response = await fetch("/api/v1/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      const resJson = await response.json();
      if (resJson.success) {
        const app = resJson.data.application;
        setActiveApplication(app);
        fetchApplications(); // refresh the queue table instantly!

        if (pollingIntervalId) {
          clearInterval(pollingIntervalId);
        }

        const intervalId = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/v1/applications/${app.id}`);
            const pollJson = await pollRes.json();
            if (pollJson.success) {
              const currentApp = pollJson.data.application;
              setActiveApplication(currentApp);

              if (currentApp.status === "APPLIED") {
                setPollingStatus("SUCCESS");
                clearInterval(intervalId);
                fetchApplications(); // refresh queue
                // Update local jobs status instantly
                setAllJobs((prev) =>
                  prev.map((job) =>
                    job.id === currentApp.jobId
                      ? { ...job, status: "Applied", appliedAt: currentApp.appliedAt }
                      : job
                  )
                );
              } else if (currentApp.status === "FAILED") {
                setPollingStatus("FAILED");
                clearInterval(intervalId);
                fetchApplications(); // refresh queue
              }
            }
          } catch (err) {
            console.error("[Polling Error]", err);
          }
        }, 2000);

        setPollingIntervalId(intervalId);
      } else {
        alert("Failed to queue application: " + resJson.message);
        setPollingStatus("FAILED");
        fetchApplications();
      }
    } catch (err) {
      console.error(err);
      alert("Error initiating auto apply workflow.");
      setPollingStatus("FAILED");
      fetchApplications();
    }
  };

  // 1. Process scraped jobs list for the Explore Board
  const filteredJobs = useMemo(() => {
    let result = allJobs.filter((job) => job.source !== "manual");

    if (entryLevelOnly) {
      const seniorKeywords = [
        "senior", "sr", "lead", "staff", "principal", "manager", "director", "vp", "architect", "head"
      ];
      result = result.filter((job) => {
        const titleLower = job.title.toLowerCase();
        return !seniorKeywords.some((keyword) => {
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          return regex.test(titleLower);
        });
      });
    }

    // Filter out LinkedIn jobs older than 24 hours
    const now = new Date();
    const msIn24Hours = 24 * 60 * 60 * 1000;
    result = result.filter((job) => {
      if (job.source === "linkedin") {
        const jobDate = new Date(job.createdAt);
        return (now.getTime() - jobDate.getTime()) <= msIn24Hours;
      }
      return true;
    });

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((job) =>
        [job.title, job.company, job.location, job.source].some((field) =>
          field.toLowerCase().includes(normalizedQuery),
        ),
      );
    }

    return result;
  }, [allJobs, query, entryLevelOnly]);

  // 2. Process tracked jobs list for the Application Tracker
  const trackedJobs = useMemo(() => {
    let result = allJobs.filter((job) => job.status && job.status !== "Not Applied");

    if (statusFilter !== "all") {
      result = result.filter((job) => job.status === statusFilter);
    }

    const normalizedQuery = trackerQuery.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((job) =>
        [job.title, job.company, job.location, job.platform || "", job.source].some((field) =>
          field.toLowerCase().includes(normalizedQuery),
        ),
      );
    }

    // Sort by applied date (newest first)
    return [...result].sort((a, b) => {
      const dateA = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
      const dateB = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [allJobs, trackerQuery, statusFilter]);

  // 3. Metrics for the Tracker Dashboard
  const metrics = useMemo(() => {
    const tracked = allJobs.filter((job) => job.status && job.status !== "Not Applied");
    return {
      total: tracked.length,
      interviewing: tracked.filter((j) => j.status === "Interview Scheduled").length,
      offers: tracked.filter((j) => j.status === "Offer").length,
      rejected: tracked.filter((j) => j.status === "Rejected").length,
    };
  }, [allJobs]);

  // Handles starting the tracking flow
  const handleOpenTrackModal = (job: Job) => {
    setSelectedJobForTrack(job);
    setTrackStatus(job.status || "Applied");
    setTrackPlatform(job.platform || job.source || "LinkedIn");
    setTrackNotes(job.notes || "");
  };

  // Submits updates to a job status
  const handleUpdateStatus = async (jobId: string, status: string, platform: string, notes: string) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, platform, notes }),
      });

      const resJson = await response.json();
      if (resJson.success) {
        // Update local state reactively
        setAllJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status,
                  platform,
                  notes,
                  appliedAt: resJson.data.job.appliedAt,
                  updatedAt: resJson.data.job.updatedAt,
                }
              : job
          )
        );
        setSelectedJobForTrack(null);
      } else {
        alert("Failed to update status: " + resJson.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error updating status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submits a manually added job application
  const handleAddManualApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualCompany) {
      alert("Role Title and Company Name are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          company: manualCompany,
          location: manualLocation || "Remote",
          salary: manualSalary || null,
          applyUrl: manualUrl || null,
          status: manualStatus,
          platform: manualPlatform,
          notes: manualNotes,
        }),
      });

      const resJson = await response.json();
      if (resJson.success) {
        // Add new manual job at the start of local state
        setAllJobs((prev) => [resJson.data.job, ...prev]);
        setShowManualModal(false);

        // Reset form
        setManualTitle("");
        setManualCompany("");
        setManualLocation("");
        setManualSalary("");
        setManualUrl("");
        setManualPlatform("College");
        setManualStatus("Applied");
        setManualNotes("");
      } else {
        alert("Failed to add: " + resJson.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error tracking manual application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for platform styling tag colors
  const getPlatformTagClass = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("college")) return "tag-college";
    if (p.includes("referral")) return "tag-referral";
    if (p.includes("linkedin")) return "tag-linkedin";
    if (p.includes("wellfound")) return "tag-wellfound";
    if (p.includes("yc") || p.includes("combinator")) return "tag-yc";
    return "tag-direct";
  };

  return (
    <div className="jobs-board-wrapper">
      {/* Dynamic Navigation Tabs */}
      <nav className="board-tabs" aria-label="Job Board Navigation">
        <button
          className={`board-tab-btn ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
          Explore Board
        </button>
        <button
          className={`board-tab-btn ${activeTab === "queue" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("queue");
            fetchApplications();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Auto-Apply Queue
        </button>
        <button
          className={`board-tab-btn ${activeTab === "tracker" ? "active" : ""}`}
          onClick={() => setActiveTab("tracker")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Application Tracker
        </button>
      </nav>

      {/* ==================== EXPLORE BOARD TAB ==================== */}
      {activeTab === "explore" && (
        <section className="jobs-section">
          <div className="jobs-section__header">
            <div>
              <p className="section-kicker">All listings</p>
              <h2>Fresh scraped roles</h2>
            </div>

            <div className="jobs-toolbar">
              <div className="jobs-toolbar-controls">
                <label className="checkbox-filter" htmlFor="entry-level-toggle">
                  <input
                    id="entry-level-toggle"
                    type="checkbox"
                    checked={entryLevelOnly}
                    onChange={(e) => setEntryLevelOnly(e.target.checked)}
                  />
                  <span>Entry Level (0-1 yrs exp)</span>
                </label>

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
              </div>
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
                <JobCard
                  key={job.id}
                  job={job}
                  onTrack={handleOpenTrackModal}
                  onSelect={(j) => {
                    setSelectedJobDetails(j);
                    setActiveApplication(null);
                    setPollingStatus("IDLE");
                    if (pollingIntervalId) {
                      clearInterval(pollingIntervalId);
                      setPollingIntervalId(null);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ==================== APPLICATION TRACKER TAB ==================== */}
      {activeTab === "tracker" && (
        <section className="tracker-section">
          {/* Metrics Dashboard */}
          <div className="tracker-metrics-grid">
            <div className="metric-card metric-total">
              <div className="metric-card-inner">
                <span className="metric-label">Applications</span>
                <span className="metric-val">{metrics.total}</span>
              </div>
              <div className="metric-card-accent" />
            </div>

            <div className="metric-card metric-interviewing">
              <div className="metric-card-inner">
                <span className="metric-label">Interviewing</span>
                <span className="metric-val text-blue">{metrics.interviewing}</span>
              </div>
              <div className="metric-card-accent" />
            </div>

            <div className="metric-card metric-offers">
              <div className="metric-card-inner">
                <span className="metric-label">Offers Received</span>
                <span className="metric-val text-green">{metrics.offers}</span>
              </div>
              <div className="metric-card-accent" />
            </div>

            <div className="metric-card metric-rejected">
              <div className="metric-card-inner">
                <span className="metric-label">Rejections</span>
                <span className="metric-val text-red">{metrics.rejected}</span>
              </div>
              <div className="metric-card-accent" />
            </div>
          </div>

          {/* Tracker Toolbar */}
          <div className="tracker-toolbar-container">
            <div className="tracker-toolbar-left">
              <h2>My Applications</h2>
              <p className="tracker-toolbar-sub">{trackedJobs.length} active pipelines</p>
            </div>

            <div className="tracker-toolbar-right">
              {/* Search */}
              <div className="tracker-search-box">
                <input
                  type="text"
                  placeholder="Filter by company, role..."
                  value={trackerQuery}
                  onChange={(e) => setTrackerQuery(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div className="tracker-status-filter">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="Applied">Applied</option>
                  <option value="Followed Up">Followed Up</option>
                  <option value="Interview Scheduled">Interview Scheduled</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Offer">Offer</option>
                </select>
              </div>

              {/* Add Manual Application Button */}
              <button className="add-app-btn" onClick={() => setShowManualModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Track Application
              </button>
            </div>
          </div>

          {/* Applications list */}
          {trackedJobs.length === 0 ? (
            <div className="empty-state">
              <h3>No tracked applications yet</h3>
              <p>Go to the &quot;Explore Board&quot; to track a scraped job, or click &quot;Track Application&quot; to add a manual entry!</p>
            </div>
          ) : (
            <div className="tracker-table-container">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Date Applied</th>
                    <th>Notes & Details</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedJobs.map((job) => {
                    const statusColor = getStatusStyle(job.status || "");
                    const isDropdownActive = activeInlineDropdownId === job.id;

                    return (
                      <tr key={job.id} className="tracker-row">
                        <td className="company-col">
                          <strong>{job.company}</strong>
                        </td>
                        <td className="role-col">
                          <span>{job.title}</span>
                          {job.applyUrl && (
                            <a
                              href={job.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-url-icon"
                              title="Go to posting"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          )}
                        </td>
                        <td className="platform-col">
                          <span className={`platform-pill ${getPlatformTagClass(job.platform || job.source || "")}`}>
                            {job.platform || job.source}
                          </span>
                        </td>
                        <td className="status-col">
                          {/* Premium interactive status dropdown */}
                          <div className="status-select-container">
                            <button
                              className="status-dropdown-trigger"
                              style={{
                                background: statusColor.bg,
                                color: statusColor.text,
                              }}
                              onClick={() =>
                                setActiveInlineDropdownId(isDropdownActive ? null : job.id)
                              }
                            >
                              {statusColor.label}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {isDropdownActive && (
                              <div className="status-floating-menu">
                                <button
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Applied", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Applied
                                </button>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Followed Up", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Followed Up
                                </button>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Interview Scheduled", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Interview Scheduled
                                </button>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Offer", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Offer
                                </button>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Rejected", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Rejected
                                </button>
                                <div className="dropdown-divider" />
                                <button
                                  className="text-muted-delete"
                                  onClick={() => {
                                    handleUpdateStatus(job.id, "Not Applied", job.platform || job.source, job.notes || "");
                                    setActiveInlineDropdownId(null);
                                  }}
                                >
                                  Stop Tracking
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="date-col">
                          {job.appliedAt
                            ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                                new Date(job.appliedAt)
                              )
                            : "-"}
                        </td>
                        <td className="notes-col">
                          <div className="notes-display">
                            {job.notes ? (
                              <span className="notes-text" title={job.notes}>
                                {job.notes}
                              </span>
                            ) : (
                              <span className="no-notes-placeholder">No notes added</span>
                            )}
                            <button
                              className="edit-notes-icon-btn"
                              onClick={() => handleOpenTrackModal(job)}
                              title="Edit notes/platform"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ==================== AUTO-APPLY LIVE QUEUE TAB ==================== */}
      {activeTab === "queue" && (
        <section className="tracker-section" style={{ minHeight: "60vh" }}>
          <div className="tracker-toolbar-container">
            <div className="tracker-toolbar-left">
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: "0" }}>Auto-Apply Live Queue</h2>
              <p className="tracker-toolbar-sub" style={{ margin: "4px 0 0" }}>
                Tracks live tailoring (Gemini/OpenAI) and background browser execution (Playwright)
              </p>
            </div>
            <div className="tracker-toolbar-right">
              <button 
                className="add-app-btn" 
                onClick={fetchApplications}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "42px",
                  padding: "0.65rem 1.15rem",
                  borderRadius: "999px",
                  background: "var(--primary)",
                  color: "white",
                  fontSize: "0.92rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 180ms ease"
                }}
              >
                🔄 Refresh Queue
              </button>
            </div>
          </div>

          {applications.length === 0 ? (
            <div className="empty-state" style={{ padding: "4rem 2rem", textAlign: "center", backgroundColor: "#f9fafb", borderRadius: "16px", border: "1px dashed var(--border)", marginTop: "1.5rem" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>No applications in queue yet</h3>
              <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                Go to the &quot;Explore Board&quot;, click on a scraped job card, and click &quot;Auto Apply Now&quot; to launch your first automated application!
              </p>
            </div>
          ) : (
            <div className="tracker-table-container" style={{ marginTop: "1.5rem", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <table className="tracker-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Job & Company</th>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Platform</th>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Triggered At</th>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Queue Status</th>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Optimized Resume</th>
                    <th style={{ padding: "1rem 1.25rem", fontWeight: 600, fontSize: "0.85rem", color: "#475569" }}>Details / Error Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const triggeredDate = new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    }).format(new Date(app.createdAt));

                    // Status Badge Helper
                    let statusBg = "#f1f5f9";
                    let statusColor = "#475569";
                    let statusLabel = app.status;
                    let isGlowing = false;

                    switch (app.status) {
                      case "QUEUED":
                        statusBg = "#e2e8f0";
                        statusColor = "#475569";
                        statusLabel = "Queued";
                        break;
                      case "GENERATING_RESUME":
                        statusBg = "#f3e8ff";
                        statusColor = "#7e22ce";
                        statusLabel = "Tailoring Resume...";
                        isGlowing = true;
                        break;
                      case "READY_TO_APPLY":
                        statusBg = "#e0e7ff";
                        statusColor = "#4338ca";
                        statusLabel = "Resume Compiled";
                        isGlowing = true;
                        break;
                      case "APPLYING":
                        statusBg = "#ffedd5";
                        statusColor = "#c2410c";
                        statusLabel = "Applying via Playwright...";
                        isGlowing = true;
                        break;
                      case "APPLIED":
                        statusBg = "#d1fae5";
                        statusColor = "#047857";
                        statusLabel = "Applied ✓";
                        break;
                      case "FAILED":
                        statusBg = "#fee2e2";
                        statusColor = "#b91c1c";
                        statusLabel = "Failed ⚠️";
                        break;
                    }

                    return (
                      <tr key={app.id} className="tracker-row" style={{ borderBottom: "1px solid var(--border)", transition: "background 150ms ease" }}>
                        <td style={{ padding: "1rem 1.25rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <strong style={{ fontSize: "0.95rem", color: "#111827" }}>{app.job.title}</strong>
                            <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>{app.job.company}</span>
                          </div>
                        </td>
                        <td style={{ padding: "1rem 1.25rem" }}>
                          <span className={`platform-pill tag-${app.job.source}`} style={{ fontSize: "0.78rem" }}>
                            {app.job.source}
                          </span>
                        </td>
                        <td style={{ padding: "1rem 1.25rem", fontSize: "0.88rem", color: "#4b5563" }}>
                          {triggeredDate}
                        </td>
                        <td style={{ padding: "1rem 1.25rem" }}>
                          <span
                            style={{
                              background: statusBg,
                              color: statusColor,
                              padding: "0.25rem 0.65rem",
                              borderRadius: "999px",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                              animation: isGlowing ? "pulseGlow 1.5s infinite alternate" : "none"
                            }}
                          >
                            {isGlowing && (
                              <span style={{
                                width: "6px",
                                height: "6px",
                                backgroundColor: statusColor,
                                borderRadius: "50%",
                                display: "inline-block"
                              }} />
                            )}
                            {statusLabel}
                          </span>
                        </td>
                        <td style={{ padding: "1rem 1.25rem" }}>
                          {app.resumeVersion ? (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <a
                                href={`/api/v1/applications/${app.id}/download?type=pdf`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: "0.35rem 0.65rem",
                                  backgroundColor: "#4338ca",
                                  borderRadius: "6px",
                                  color: "white",
                                  fontSize: "0.78rem",
                                  fontWeight: 500,
                                  textDecoration: "none",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                                }}
                              >
                                PDF
                              </a>
                              <a
                                href={`/api/v1/applications/${app.id}/download?type=latex`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: "0.35rem 0.65rem",
                                  backgroundColor: "#f3f4f6",
                                  borderRadius: "6px",
                                  color: "#374151",
                                  fontSize: "0.78rem",
                                  fontWeight: 500,
                                  textDecoration: "none",
                                  border: "1px solid #d1d5db"
                                }}
                              >
                                .tex
                              </a>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontStyle: "italic" }}>
                              {app.status === "FAILED" ? "Not Created" : "Compiling..."}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "1rem 1.25rem", fontSize: "0.85rem", maxWidth: "250px" }}>
                          {app.status === "FAILED" ? (
                            <span style={{ color: "#ef4444", fontWeight: 500, wordBreak: "break-word" }}>
                              {app.errorMessage || "Submission failed"}
                            </span>
                          ) : app.status === "APPLIED" ? (
                            <span style={{ color: "#10b981", fontWeight: 500 }}>
                              Submitted successfully via Playwright!
                            </span>
                          ) : (
                            <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                              Processing background task...
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ==================== SCRAPED JOB TRACK MODAL ==================== */}
      {selectedJobForTrack && (
        <div className="glass-modal-overlay" onClick={() => setSelectedJobForTrack(null)}>
          <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="glass-modal-header">
              <div>
                <p className="modal-kicker">Track application status</p>
                <h3>{selectedJobForTrack.company}</h3>
                <p className="modal-subtitle">{selectedJobForTrack.title}</p>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedJobForTrack(null)}>
                &times;
              </button>
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUpdateStatus(selectedJobForTrack.id, trackStatus, trackPlatform, trackNotes);
              }}
              className="modal-form"
            >
              <div className="form-group">
                <label htmlFor="modal-status">Application Status</label>
                <select
                  id="modal-status"
                  value={trackStatus}
                  onChange={(e) => setTrackStatus(e.target.value)}
                >
                  <option value="Applied">Applied</option>
                  <option value="Followed Up">Followed Up</option>
                  <option value="Interview Scheduled">Interview Scheduled</option>
                  <option value="Offer">Offer</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Not Applied">Not Applied (Stop Tracking)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="modal-platform">Platform / Source</label>
                <select
                  id="modal-platform"
                  value={trackPlatform}
                  onChange={(e) => setTrackPlatform(e.target.value)}
                >
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Wellfound">Wellfound</option>
                  <option value="YC">YC</option>
                  <option value="College">College</option>
                  <option value="Referral">Referral</option>
                  <option value="Direct">Direct Application</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="modal-notes">Notes / Outreach log</label>
                <textarea
                  id="modal-notes"
                  placeholder="e.g. Referred by John Doe, contacted hiring manager on LinkedIn..."
                  rows={4}
                  value={trackNotes}
                  onChange={(e) => setTrackNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedJobForTrack(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== ADD MANUAL APPLICATION MODAL ==================== */}
      {showManualModal && (
        <div className="glass-modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="glass-modal-header">
              <div>
                <p className="modal-kicker">New Entry</p>
                <h3>Track Application</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowManualModal(false)}>
                &times;
              </button>
            </header>

            <form onSubmit={handleAddManualApplication} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manual-company">Company *</label>
                  <input
                    type="text"
                    id="manual-company"
                    required
                    placeholder="e.g. Google, Morphie Labs"
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="manual-title">Role Title *</label>
                  <input
                    type="text"
                    id="manual-title"
                    required
                    placeholder="e.g. SDE Intern, Python Developer"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manual-loc">Location</label>
                  <input
                    type="text"
                    id="manual-loc"
                    placeholder="e.g. Remote, New York"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="manual-sal">Salary Info</label>
                  <input
                    type="text"
                    id="manual-sal"
                    placeholder="e.g. $60/hr, 12 LPA"
                    value={manualSalary}
                    onChange={(e) => setManualSalary(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manual-plat">Platform / Source</label>
                  <select
                    id="manual-plat"
                    value={manualPlatform}
                    onChange={(e) => setManualPlatform(e.target.value)}
                  >
                    <option value="College">College Placement</option>
                    <option value="Referral">Referral</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Wellfound">Wellfound</option>
                    <option value="YC">YC</option>
                    <option value="Direct">Direct Application</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="manual-status">Current Status</label>
                  <select
                    id="manual-status"
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                  >
                    <option value="Applied">Applied</option>
                    <option value="Followed Up">Followed Up</option>
                    <option value="Interview Scheduled">Interview Scheduled</option>
                    <option value="Offer">Offer</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="manual-url">Job Posting URL (Optional)</label>
                <input
                  type="url"
                  id="manual-url"
                  placeholder="https://company.com/careers/job-id"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="manual-notes">Outreach & Application Notes</label>
                <textarea
                  id="manual-notes"
                  placeholder="e.g. Interview scheduled with HR on Tuesday, referred by alumni..."
                  rows={3}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Tracking..." : "Save Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== PREMIUM JOB DETAILS SLIDE-OVER DRAWER ==================== */}
      {selectedJobDetails && (
        <div 
          className="drawer-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(6px)",
            zIndex: 999,
            display: "flex",
            justifyContent: "flex-end",
            animation: "fadeIn 200ms ease-out",
          }}
          onClick={() => {
            setSelectedJobDetails(null);
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId);
              setPollingIntervalId(null);
            }
          }}
        >
          <div 
            className="drawer-container"
            style={{
              width: "100%",
              maxWidth: "580px",
              height: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              backdropFilter: "blur(20px)",
              boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.12)",
              display: "flex",
              flexDirection: "column",
              padding: "0",
              zIndex: 1000,
              cursor: "default",
              borderLeft: "1px solid rgba(0, 0, 0, 0.08)",
              animation: "slideIn 300ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <header 
              style={{
                padding: "1.75rem 2rem 1.5rem",
                borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
                background: "linear-gradient(135deg, #faf9f6 0%, #f4f2ee 100%)",
                position: "relative",
              }}
            >
              <button 
                onClick={() => {
                  setSelectedJobDetails(null);
                  if (pollingIntervalId) {
                    clearInterval(pollingIntervalId);
                    setPollingIntervalId(null);
                  }
                }}
                style={{
                  position: "absolute",
                  top: "1.5rem",
                  right: "1.5rem",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 150ms ease",
                }}
                className="close-drawer-btn"
              >
                &times;
              </button>
              
              <div style={{ paddingRight: "2.5rem" }}>
                <span 
                  className={`source-label ${selectedJobDetails.source}`}
                  style={{
                    display: "inline-block",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    backgroundColor: "rgba(67, 56, 202, 0.08)",
                    color: "#4338ca",
                    marginBottom: "0.75rem",
                  }}
                >
                  {selectedJobDetails.source}
                </span>
                <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#111827", margin: "0 0 0.35rem" }}>
                  {selectedJobDetails.title}
                </h2>
                <p style={{ fontSize: "1.1rem", color: "#4b5563", fontWeight: 500, margin: "0" }}>
                  {selectedJobDetails.company}
                </p>
              </div>
            </header>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "2rem" }} className="drawer-body">
              {/* Metadata Badges */}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
                <div style={{ background: "#f3f4f6", padding: "0.6rem 1rem", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "2px", flex: "1 1 120px" }}>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>Location</span>
                  <span style={{ fontSize: "0.92rem", fontWeight: 500, color: "#1f2937" }}>{selectedJobDetails.location}</span>
                </div>
                <div style={{ background: "#f3f4f6", padding: "0.6rem 1rem", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "2px", flex: "1 1 120px" }}>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>Salary</span>
                  <span style={{ fontSize: "0.92rem", fontWeight: 500, color: "#1f2937" }}>{selectedJobDetails.salary ?? "Not Listed"}</span>
                </div>
              </div>

              {/* AUTO APPLY ACTIONS WIDGET */}
              <div 
                style={{
                  background: "linear-gradient(135deg, #1e1b4b 0%, #311042 100%)",
                  borderRadius: "16px",
                  padding: "1.75rem 2rem",
                  color: "white",
                  marginBottom: "2rem",
                  boxShadow: "0 8px 30px rgba(49, 16, 66, 0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0", color: "#e0e7ff" }}>AI Auto Apply Pipeline</h3>
                    <p style={{ fontSize: "0.82rem", color: "#c7d2fe", margin: "4px 0 0" }}>Tailors resume + submits via Playwright</p>
                  </div>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>

                {pollingStatus === "IDLE" && (
                  <button
                    onClick={() => handleAutoApply(selectedJobDetails.id)}
                    style={{
                      width: "100%",
                      padding: "0.9rem",
                      borderRadius: "12px",
                      background: "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
                      color: "white",
                      fontSize: "1.05rem",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 4px 15px rgba(168, 85, 247, 0.4)",
                      transition: "transform 150ms ease, opacity 150ms ease",
                    }}
                    onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
                    onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
                    className="auto-apply-btn"
                  >
                    🚀 Auto Apply Now
                  </button>
                )}

                {pollingStatus === "POLLING" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {/* Glowing progress steps */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(255,255,255,0.08)", padding: "0.75rem 1rem", borderRadius: "10px" }}>
                      <div className="spinner" style={{
                        width: "18px",
                        height: "18px",
                        border: "2px solid rgba(255, 255, 255, 0.25)",
                        borderTopColor: "white",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite"
                      }} />
                      <span style={{ fontSize: "0.92rem", fontWeight: 500 }}>
                        {activeApplication?.status === "QUEUED" && "Queuing pipeline task..."}
                        {activeApplication?.status === "GENERATING_RESUME" && "Tailoring resume with OpenAI..."}
                        {activeApplication?.status === "READY_TO_APPLY" && "Compiling high-fidelity PDF resume..."}
                        {activeApplication?.status === "APPLYING" && "Playwright active: Navigating forms..."}
                        {!activeApplication?.status && "Initializing AI optimization..."}
                      </span>
                    </div>

                    {/* Progress visual list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem", color: "#cbd5e1", paddingLeft: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: activeApplication?.status ? 1 : 0.5 }}>
                        <span>{activeApplication?.status !== "QUEUED" ? "✓" : "●"}</span>
                        <span style={{ marginLeft: "6px" }}>Optimize Resume using OpenAI</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: ["READY_TO_APPLY", "APPLYING", "APPLIED"].includes(activeApplication?.status) ? 1 : 0.5 }}>
                        <span>{["READY_TO_APPLY", "APPLYING", "APPLIED"].includes(activeApplication?.status) ? "✓" : "○"}</span>
                        <span style={{ marginLeft: "6px" }}>Compile tailored LaTeX & PDF resume</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: ["APPLYING", "APPLIED"].includes(activeApplication?.status) ? 1 : 0.5 }}>
                        <span>{activeApplication?.status === "APPLIED" ? "✓" : activeApplication?.status === "APPLYING" ? "●" : "○"}</span>
                        <span style={{ marginLeft: "6px" }}>Launch Playwright headed apply flow</span>
                      </div>
                    </div>
                  </div>
                )}

                {pollingStatus === "SUCCESS" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(16, 185, 129, 0.2)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                      <span style={{ fontSize: "1.2rem", color: "#10b981" }}>✓</span>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#a7f3d0" }}>Successfully Applied!</span>
                    </div>

                    {activeApplication?.resumeVersion && (
                      <div style={{ display: "flex", gap: "0.75rem", marginTop: "4px" }}>
                        <a
                          href={`/api/v1/applications/${activeApplication.id}/download?type=pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            flex: 1,
                            padding: "0.6rem 0.8rem",
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                            borderRadius: "8px",
                            color: "white",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            textAlign: "center",
                            textDecoration: "none",
                            border: "1px solid rgba(255,255,255,0.15)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px"
                          }}
                        >
                          📥 Download Tailored PDF
                        </a>
                        <a
                          href={`/api/v1/applications/${activeApplication.id}/download?type=latex`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "0.6rem 0.8rem",
                            backgroundColor: "transparent",
                            borderRadius: "8px",
                            color: "#cbd5e1",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            textAlign: "center",
                            textDecoration: "none",
                            border: "1px solid rgba(255,255,255,0.1)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          Source (.tex)
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {pollingStatus === "FAILED" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", background: "rgba(239, 68, 68, 0.15)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fca5a5" }}>⚠️ Pipeline Failed</span>
                      <span style={{ fontSize: "0.78rem", color: "#fecaca", wordBreak: "break-word" }}>{activeApplication?.errorMessage || "An unexpected error occurred during submission."}</span>
                    </div>

                    <button
                      onClick={() => handleAutoApply(selectedJobDetails.id)}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.1)",
                        color: "white",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        border: "1px solid rgba(255,255,255,0.2)",
                        cursor: "pointer",
                      }}
                    >
                      🔄 Retry Application
                    </button>
                  </div>
                )}
              </div>

              {/* Full JD Panel */}
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#111827", marginBottom: "0.75rem" }}>Full Job Description</h3>
                {selectedJobDetails.description ? (
                  <div 
                    style={{ 
                      fontSize: "0.92rem", 
                      color: "#374151", 
                      lineHeight: "1.6", 
                      whiteSpace: "pre-wrap",
                      backgroundColor: "#f9fafb",
                      padding: "1.25rem",
                      borderRadius: "12px",
                      border: "1px solid #e5e7eb"
                    }}
                  >
                    {selectedJobDetails.description}
                  </div>
                ) : (
                  <div 
                    style={{ 
                      fontSize: "0.9rem", 
                      color: "#6b7280", 
                      lineHeight: "1.5", 
                      backgroundColor: "#f9fafb",
                      padding: "1.25rem",
                      borderRadius: "12px",
                      border: "1px solid #e5e7eb",
                      textAlign: "center"
                    }}
                  >
                    <p style={{ fontWeight: 500, color: "#475569", marginBottom: "0.5rem" }}>Job description details are not cached.</p>
                    <p style={{ fontSize: "0.8rem" }}>
                      Click <strong>Auto Apply Now</strong> to pre-fetch the full JD live using Playwright before compiling your AI tailored resume!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulseGlow {
          from { opacity: 0.65; box-shadow: 0 0 2px rgba(67, 56, 202, 0.1); }
          to { opacity: 1; box-shadow: 0 0 8px rgba(67, 56, 202, 0.4); }
        }
      `}</style>
    </div>
  );
}
