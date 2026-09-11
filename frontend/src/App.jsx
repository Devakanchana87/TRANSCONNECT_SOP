import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://127.0.0.1:5000";

axios.defaults.withCredentials = true;

const STORAGE = {
  savedJobs: "transconnect_saved_jobs",
  applications: "transconnect_applications",
  profileExtras: "transconnect_profile_extras",
  resume: "transconnect_resume",
};

const defaultExtras = {
  headline: "",
  phone: "",
  location: "",
  portfolio: "",
  linkedin: "",
  github: "",
  summary: "",
  targetRole: "",
};

function getStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSkills(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJobSkills(job) {
  return normalizeSkills(job?.skills);
}

function getJobMatch(job, profileSkills) {
  const required = getJobSkills(job).map((s) => s.toLowerCase());
  const current = profileSkills.map((s) => s.toLowerCase());

  if (!required.length) return 0;

  const matched = required.filter((skill) =>
    current.some(
      (userSkill) =>
        userSkill.includes(skill) || skill.includes(userSkill)
    )
  );

  return Math.round((matched.length / required.length) * 100);
}

function App() {
  const [page, setPage] = useState("landing");
  const [activePage, setActivePage] = useState("jobs");

  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [skillData, setSkillData] = useState(null);

  const [search, setSearch] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [sortBy, setSortBy] = useState("relevance");

  const [selectedJob, setSelectedJob] = useState("");
  const [selectedJobObject, setSelectedJobObject] = useState(null);

  const [showProfile, setShowProfile] = useState(false);
  const [profileTab, setProfileTab] = useState("overview");

  const [showJobDetails, setShowJobDetails] = useState(false);
  const [showApply, setShowApply] = useState(false);

  const [showChatbot, setShowChatbot] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      sender: "bot",
      text:
        "Hi! I'm your TransConnect Career Assistant. Ask me about jobs, skill gaps, learning paths, applications or your career profile.",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const [savedJobs, setSavedJobs] = useState(
    getStored(STORAGE.savedJobs, [])
  );

  const [applications, setApplications] = useState(
    getStored(STORAGE.applications, [])
  );

  const [profileExtras, setProfileExtras] = useState(
    getStored(STORAGE.profileExtras, defaultExtras)
  );

  const [resume, setResume] = useState(
    getStored(STORAGE.resume, null)
  );

  const [name, setName] = useState("");
  const [education, setEducation] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [applicationName, setApplicationName] = useState("");
  const [applicationEmail, setApplicationEmail] = useState("");
  const [applicationPhone, setApplicationPhone] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [toast, setToast] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] =
    useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    checkAuthentication();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE.savedJobs,
      JSON.stringify(savedJobs)
    );
  }, [savedJobs]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE.applications,
      JSON.stringify(applications)
    );
  }, [applications]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE.profileExtras,
      JSON.stringify(profileExtras)
    );
  }, [profileExtras]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE.resume,
      JSON.stringify(resume)
    );
  }, [resume]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const profileSkills = useMemo(
    () => normalizeSkills(skills),
    [skills]
  );

  const userId =
    user?.id ||
    user?.user_id ||
    user?.userId ||
    1;

  const profileCompletion = useMemo(() => {
    const checks = [
      Boolean(name.trim()),
      Boolean(education.trim()),
      profileSkills.length > 0,
      Boolean(experience.trim()),
      Boolean(profileExtras.headline?.trim()),
      Boolean(profileExtras.summary?.trim()),
      Boolean(profileExtras.targetRole?.trim()),
      Boolean(resume),
    ];

    return Math.round(
      (checks.filter(Boolean).length / checks.length) * 100
    );
  }, [
    name,
    education,
    profileSkills,
    experience,
    profileExtras,
    resume,
  ]);

  const savedJobObjects = useMemo(() => {
    return jobs.filter((job) =>
      savedJobs.includes(String(job.id))
    );
  }, [jobs, savedJobs]);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    const query = search.toLowerCase().trim();
    const locationQuery = searchLocation.toLowerCase().trim();

    if (query) {
      result = result.filter((job) => {
        const text =
          `${job.title || ""} ${job.company || ""} ${
            job.location || ""
          } ${job.skills || ""} ${job.description || ""}`.toLowerCase();

        return text.includes(query);
      });
    }

    if (locationQuery) {
      result = result.filter((job) =>
        String(job.location || "")
          .toLowerCase()
          .includes(locationQuery)
      );
    }

    if (sortBy === "match") {
      result.sort(
        (a, b) =>
          getJobMatch(b, profileSkills) -
          getJobMatch(a, profileSkills)
      );
    }

    if (sortBy === "title") {
      result.sort((a, b) =>
        String(a.title || "").localeCompare(
          String(b.title || "")
        )
      );
    }

    return result;
  }, [
    jobs,
    search,
    searchLocation,
    sortBy,
    profileSkills,
  ]);

  const showToast = (message) => {
    setToast(message);
  };

  const checkAuthentication = async () => {
    try {
      const response = await axios.get(`${API}/api/auth/me`);

      if (response.data.authenticated) {
        setUser(response.data.user);
        setPage("portal");
        await loadJobs();
        await loadProfileSilently();
      }
    } catch {
      setPage("landing");
    }
  };

  const loadJobs = async () => {
    setLoadingJobs(true);

    try {
      const response = await axios.get(`${API}/api/jobs`);
      setJobs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error(error);
      showToast("Unable to load jobs from the server.");
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadProfileSilently = async () => {
    try {
      const response = await axios.get(`${API}/api/profile`);

      if (response.data.profile) {
        const profile = response.data.profile;

        setName(profile.name || "");
        setEducation(profile.education || "");
        setSkills(profile.skills || "");
        setExperience(profile.experience || "");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    setAuthError("");
    setAuthLoading(true);

    try {
      const response = await axios.post(
        `${API}/api/auth/login`,
        {
          email: loginEmail,
          password: loginPassword,
        }
      );

      setUser(response.data.user);

      setLoginEmail("");
      setLoginPassword("");

      await loadJobs();
      await loadProfileSilently();

      setPage("portal");
      setActivePage("jobs");
    } catch (error) {
      setAuthError(
        error.response?.data?.error ||
          "Unable to login. Please try again."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    setAuthError("");
    setAuthLoading(true);

    try {
      await axios.post(
        `${API}/api/auth/register`,
        {
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }
      );

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");

      setPage("login");
      setAuthError("");

      showToast(
        "Account created successfully. Please sign in."
      );
    } catch (error) {
      setAuthError(
        error.response?.data?.error ||
          "Unable to create account."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/api/auth/logout`);
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setPage("landing");
    setActivePage("jobs");
  };

  const getRecommendations = async () => {
    setLoadingRecommendations(true);

    try {
      const response = await axios.get(
        `${API}/api/recommendations/${userId}`
      );

      const data = Array.isArray(response.data)
        ? response.data
        : [];

      setRecommendations(data);
      setActivePage("recommended");
    } catch (error) {
      console.error(error);
      showToast(
        "Create your profile first to unlock personalised recommendations."
      );
      setActivePage("recommended");
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const getSkillRecommendations = async (
    jobId = selectedJob
  ) => {
    if (!jobId) {
      showToast("Select a target job first.");
      return;
    }

    setLoadingSkills(true);
    setSelectedJob(String(jobId));

    try {
      const response = await axios.get(
        `${API}/api/skill-recommendations/${userId}/${jobId}`
      );

      setSkillData(response.data);
      setActivePage("learning");
    } catch (error) {
      console.error(error);
      showToast(
        error.response?.data?.error ||
          "Unable to analyse this role. Please save your profile first."
      );
    } finally {
      setLoadingSkills(false);
    }
  };

  const openProfile = async () => {
    await loadProfileSilently();
    setShowProfile(true);
    setProfileTab("overview");
  };

  const createProfile = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        `${API}/api/profiles`,
        {
          name,
          education,
          skills,
          experience,
        }
      );

      setUser((current) =>
        current
          ? {
              ...current,
              name,
            }
          : current
      );

      setShowProfile(false);

      showToast(
        response.data.message ||
          "Profile updated successfully."
      );

      await getRecommendationsSilently();
    } catch (error) {
      console.error(error);

      showToast(
        error.response?.data?.error ||
          "Profile update failed."
      );
    }
  };

  const getRecommendationsSilently = async () => {
    try {
      const response = await axios.get(
        `${API}/api/recommendations/${userId}`
      );

      setRecommendations(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch {
      // Profile can still be saved if recommendation service is unavailable.
    }
  };

  const toggleSaveJob = (job) => {
    const id = String(job.id);

    setSavedJobs((current) => {
      if (current.includes(id)) {
        showToast("Job removed from saved jobs.");
        return current.filter((item) => item !== id);
      }

      showToast("Job saved to your career shortlist.");
      return [...current, id];
    });
  };

  const openJob = (job) => {
    setSelectedJobObject(job);
    setSelectedJob(String(job.id));
    setShowJobDetails(true);
  };

  const openApply = (job) => {
    setSelectedJobObject(job);
    setSelectedJob(String(job.id));

    setApplicationName(name || user?.name || "");
    setApplicationEmail(user?.email || "");
    setApplicationPhone(profileExtras.phone || "");
    setCoverLetter("");

    setShowApply(true);
  };

  const submitApplication = async (e) => {
    e.preventDefault();

    if (!selectedJobObject) return;

    const newApplication = {
      id: `local-${Date.now()}`,
      job_id: selectedJobObject.id,
      title: selectedJobObject.title,
      company: selectedJobObject.company,
      location: selectedJobObject.location,
      name: applicationName,
      email: applicationEmail,
      phone: applicationPhone,
      cover_letter: coverLetter,
      status: "Applied",
      applied_at: new Date().toISOString(),
    };

    try {
      await axios.post(`${API}/api/applications`, {
        job_id: selectedJobObject.id,
        profile_id: userId,
        name: applicationName,
        email: applicationEmail,
        resume_url: resume?.name || "profile-resume",
        phone: applicationPhone,
        cover_letter: coverLetter,
      });
    } catch (error) {
      console.warn(
        "Application API unavailable. Keeping application in local tracker.",
        error
      );
    }

    setApplications((current) => [
      newApplication,
      ...current,
    ]);

    setShowApply(false);

    showToast(
      `Application submitted for ${selectedJobObject.title}.`
    );

    setActivePage("applications");
  };

  const updateApplicationStatus = (id, status) => {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              status,
            }
          : application
      )
    );

    showToast(`Application status updated to ${status}.`);
  };

  const removeApplication = (id) => {
    setApplications((current) =>
      current.filter(
        (application) => application.id !== id
      )
    );

    showToast("Application removed from tracker.");
  };

  const handleResumeUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!validTypes.includes(file.type)) {
      showToast(
        "Please upload a PDF, DOC or DOCX resume."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Resume must be smaller than 5 MB.");
      return;
    }

    const resumeData = {
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };

    setResume(resumeData);

    showToast("Resume added to your professional profile.");
  };

  const removeResume = () => {
    setResume(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    showToast("Resume removed.");
  };

  const updateExtra = (key, value) => {
    setProfileExtras((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const askChatbot = async (event) => {
    event?.preventDefault();

    const message = chatInput.trim();

    if (!message || chatLoading) return;

    setChatInput("");

    setChatMessages((current) => [
      ...current,
      {
        sender: "user",
        text: message,
      },
    ]);

    setChatLoading(true);

    try {
      const reply = await generateCareerResponse(message);

      setChatMessages((current) => [
        ...current,
        {
          sender: "bot",
          text: reply,
        },
      ]);
    } catch (error) {
      console.error(error);

      setChatMessages((current) => [
        ...current,
        {
          sender: "bot",
          text:
            "I couldn't complete that request right now. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const generateCareerResponse = async (message) => {
    const query = message.toLowerCase().trim();

    // The Career Assistant now uses the Flask intelligence endpoint first.
    // This keeps recommendations tied to the live PostgreSQL job data and
    // the currently signed-in user's profile.
    try {
      const response = await axios.post(`${API}/api/chatbot`, {
        message,
        profile_id: userId,
      });

      const data = response.data || {};

      if (data.type === "job_recommendation" && data.jobs?.length) {
        const topJobs = data.jobs.slice(0, 3);
        setRecommendations((current) => {
          const ids = new Set(current.map((item) => String(item.id)));
          const fromServer = jobs.filter((job) =>
            topJobs.some((item) => String(item.id) === String(job.id))
          );
          return fromServer.length ? fromServer : current;
        });
      }

      if (
        data.type === "role_skill_recommendation" &&
        data.job?.id
      ) {
        setSelectedJob(String(data.job.id));

        try {
          const skillResponse = await axios.get(
            `${API}/api/skill-recommendations/${userId}/${data.job.id}`
          );
          setSkillData(skillResponse.data);
        } catch (skillError) {
          console.error(skillError);
        }

        setActivePage("learning");
      }

      return data.reply || "I analysed your request. What would you like to explore next?";
    } catch (apiError) {
      console.warn("Career Assistant API unavailable; using local guidance.", apiError);
    }

    // Local fallback keeps the assistant useful if Flask is temporarily down.
    const mentionedJob = jobs.find((job) => {
      const title = String(job.title || "").toLowerCase();
      const company = String(job.company || "").toLowerCase();
      return (title && query.includes(title)) || (company && query.includes(company));
    });

    if (
      query.includes("recommend") ||
      query.includes("best job") ||
      query.includes("suitable job") ||
      query.includes("which job") ||
      query.includes("jobs for me")
    ) {
      const localMatches = [...jobs]
        .map((job) => ({ job, score: getJobMatch(job, profileSkills) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (localMatches.length) {
        return `Based on the jobs currently available, your strongest matches are:\n\n${localMatches
          .map(
            (item, index) =>
              `${index + 1}. ${item.job.title} — ${item.score}% skill match`
          )
          .join("\n")}\n\nOpen Recommended Jobs to explore the full matches.`;
      }
    }

    if (
      query.includes("skill") ||
      query.includes("learn") ||
      query.includes("missing")
    ) {
      const target =
        mentionedJob ||
        jobs.find((job) => {
          const title = String(job.title || "").toLowerCase();
          return query.includes("data analyst") && title.includes("data analyst");
        });

      if (target) {
        const required = getJobSkills(target);
        const missing = required.filter(
          (requiredSkill) =>
            !profileSkills.some(
              (currentSkill) =>
                currentSkill.toLowerCase().includes(requiredSkill.toLowerCase()) ||
                requiredSkill.toLowerCase().includes(currentSkill.toLowerCase())
            )
        );

        return missing.length
          ? `For ${target.title}, focus next on:\n\n${missing
              .slice(0, 8)
              .map((skill) => `• ${skill}`)
              .join("\n")}`
          : `You already cover the skills currently listed for ${target.title}.`;
      }
    }

    if (query.includes("profile") || query.includes("resume") || query.includes("cv")) {
      return `Your profile is currently ${profileCompletion}% complete.\n\n${
        resume ? "✓ Resume uploaded" : "• Add your resume"
      }\n${
        profileExtras.headline
          ? "✓ Professional headline"
          : "• Add a professional headline"
      }\n${
        profileExtras.summary
          ? "✓ Professional summary"
          : "• Add a professional summary"
      }\n${
        profileExtras.targetRole
          ? "✓ Target role"
          : "• Add your target role"
      }`;
    }

    if (query.includes("interview")) {
      return "For interview preparation, practise role-specific technical questions, prepare STAR examples for behavioural questions, and be ready to explain every project on your resume clearly.";
    }

    return `I can help with job recommendations, role-specific skill gaps, learning paths, applications, resume/profile improvement and interview preparation.\n\nTry: “Which jobs suit me?” or “What skills do I need for Data Analyst?”`;
  };

  const navigateTo = (target) => {
    setActivePage(target);

    if (target === "recommended") {
      getRecommendations();
      return;
    }

    if (target === "learning") {
      if (selectedJob) {
        getSkillRecommendations(selectedJob);
      }
    }
  };

  const currentPageTitle = {
    jobs: "Job Search",
    recommended: "Recommended Jobs",
    learning: "Learning Path",
    applications: "Applications",
  }[activePage];

  // ============================================================
  // LANDING
  // ============================================================

  if (page === "landing") {
    return (
      <div className="landing-page">
        <header className="landing-nav">
          <div className="landing-brand">
            <div className="landing-logo">T</div>

            <div>
              <strong>TransConnect</strong>
              <span>Career Intelligence Platform</span>
            </div>
          </div>

          <div className="landing-actions">
            <button
              className="nav-login"
              onClick={() => {
                setAuthError("");
                setPage("login");
              }}
            >
              Sign in
            </button>

            <button
              className="nav-register"
              onClick={() => {
                setAuthError("");
                setPage("register");
              }}
            >
              Create account
              <span>→</span>
            </button>
          </div>
        </header>

        <main>
          <section className="landing-hero">
            <div className="landing-hero-content">
              <div className="landing-eyebrow">
                CAREER INTELLIGENCE PLATFORM
              </div>

              <h1>
                Find the work
                <br />
                <span>that moves you forward.</span>
              </h1>

              <p>
                TransConnect brings job discovery, skill
                intelligence, personalised learning and
                career guidance together in one place.
              </p>

              <div className="landing-buttons">
                <button
                  className="landing-primary"
                  onClick={() => setPage("register")}
                >
                  Build my career profile
                  <span>→</span>
                </button>

                <button
                  className="landing-secondary"
                  onClick={() => setPage("login")}
                >
                  Sign in
                </button>
              </div>

              <div className="landing-proof">
                <div>
                  <strong>01</strong>
                  <span>Discover relevant roles</span>
                </div>

                <div>
                  <strong>02</strong>
                  <span>Understand your fit</span>
                </div>

                <div>
                  <strong>03</strong>
                  <span>Build missing skills</span>
                </div>
              </div>
            </div>

            <div className="landing-dashboard-preview">
              <div className="preview-top">
                <span>CAREER DASHBOARD</span>
                <span className="preview-live">
                  <i />
                  LIVE
                </span>
              </div>

              <div className="preview-heading">
                <div>
                  <span>Career readiness</span>
                  <strong>78%</strong>
                </div>

                <div className="preview-ring">
                  <span>78</span>
                </div>
              </div>

              <div className="preview-stats">
                <div>
                  <span>Job matches</span>
                  <strong>24</strong>
                </div>

                <div>
                  <span>Skills analysed</span>
                  <strong>12</strong>
                </div>

                <div>
                  <span>Learning paths</span>
                  <strong>06</strong>
                </div>
              </div>

              <div className="preview-job">
                <div className="preview-company">A</div>

                <div>
                  <strong>Data Analyst</strong>
                  <span>AI-matched opportunity</span>
                </div>

                <b>92%</b>
              </div>

              <div className="preview-ai">
                <div className="preview-ai-icon">✦</div>

                <div>
                  <strong>Career Assistant</strong>
                  <span>
                    Ask about jobs, skills or your next move.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="landing-section">
            <div className="section-label">
              ONE CONNECTED EXPERIENCE
            </div>

            <h2>
              From finding a job
              <br />
              to becoming ready for it.
            </h2>

            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-number">01</div>

                <div className="feature-icon">⌕</div>

                <h3>Discover opportunities</h3>

                <p>
                  Search real opportunities by role, company,
                  location and skills.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-number">02</div>

                <div className="feature-icon">◉</div>

                <h3>Understand your fit</h3>

                <p>
                  Compare your profile against job
                  requirements and see where you stand.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-number">03</div>

                <div className="feature-icon">✦</div>

                <h3>Get career guidance</h3>

                <p>
                  Ask the Career Assistant for recommendations,
                  skills, courses and interview guidance.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-number">04</div>

                <div className="feature-icon">✓</div>

                <h3>Track every application</h3>

                <p>
                  Keep your applications organised from
                  submission through the hiring journey.
                </p>
              </div>
            </div>
          </section>

          <section className="landing-ai-section">
            <div className="landing-ai-copy">
              <div className="section-label">
                CAREER ASSISTANT
              </div>

              <h2>
                Your career questions,
                <br />
                answered when you need them.
              </h2>

              <p>
                Ask about suitable jobs, missing skills,
                learning paths, applications and interview
                preparation from anywhere inside TransConnect.
              </p>

              <button
                className="landing-primary"
                onClick={() => setPage("register")}
              >
                Start your career journey
                <span>→</span>
              </button>
            </div>

            <div className="landing-chat-preview">
              <div className="chat-preview-header">
                <div className="chat-avatar">✦</div>

                <div>
                  <strong>Career Assistant</strong>
                  <span>TransConnect intelligence</span>
                </div>

                <span className="online-dot" />
              </div>

              <div className="chat-preview-message bot">
                Which role are you targeting?
              </div>

              <div className="chat-preview-message user">
                Data Analyst
              </div>

              <div className="chat-preview-message bot">
                I can analyse your profile against Data Analyst
                requirements and identify the skills you should
                prioritise.
              </div>

              <div className="chat-preview-input">
                <span>Ask your career assistant...</span>
                <b>↑</b>
              </div>
            </div>
          </section>

          <section className="process-section">
            <div className="process-content">
              <div>
                <div className="section-label">
                  HOW TRANSCONNECT WORKS
                </div>

                <h2>
                  Profile.
                  <br />
                  Match.
                  <br />
                  Grow.
                </h2>

                <p>
                  A connected career workflow designed to turn
                  your profile into actionable opportunities.
                </p>
              </div>

              <div className="process-list">
                <div className="process-item">
                  <span>01</span>

                  <div>
                    <strong>Build your professional profile</strong>

                    <p>
                      Add education, skills, experience,
                      professional summary and resume.
                    </p>
                  </div>
                </div>

                <div className="process-item">
                  <span>02</span>

                  <div>
                    <strong>Explore matched opportunities</strong>

                    <p>
                      Search and compare positions based on
                      your profile and skills.
                    </p>
                  </div>
                </div>

                <div className="process-item">
                  <span>03</span>

                  <div>
                    <strong>Analyse your skill gap</strong>

                    <p>
                      Identify the skills separating you from
                      your target role.
                    </p>
                  </div>
                </div>

                <div className="process-item">
                  <span>04</span>

                  <div>
                    <strong>Apply and track progress</strong>

                    <p>
                      Submit applications and keep every
                      opportunity organised.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="landing-footer">
          <span>© 2026 TransConnect</span>
          <span>Inclusive Careers · Intelligent Guidance</span>
        </footer>
      </div>
    );
  }

  // ============================================================
  // LOGIN
  // ============================================================

  if (page === "login") {
    return (
      <div className="auth-page">
        <div className="auth-left">
          <button
            className="auth-back"
            onClick={() => setPage("landing")}
          >
            ← Back to TransConnect
          </button>

          <div className="auth-brand">
            <div className="landing-logo">T</div>
            <strong>TransConnect</strong>
          </div>

          <div className="auth-copy">
            <div className="landing-eyebrow">
              WELCOME BACK
            </div>

            <h1>
              Your next
              <br />
              opportunity awaits.
            </h1>

            <p>
              Continue exploring opportunities, personalised
              recommendations and intelligent career guidance.
            </p>

            <div className="auth-feature">
              <span>✦</span>
              <div>
                <strong>Career Assistant</strong>
                <p>
                  Get guidance on jobs, skills and interviews.
                </p>
              </div>
            </div>

            <div className="auth-feature">
              <span>✓</span>
              <div>
                <strong>Application tracking</strong>
                <p>
                  Keep every opportunity organised in one place.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-heading">
              <div className="auth-mini-label">
                TRANSCONNECT ACCOUNT
              </div>

              <h2>Sign in</h2>

              <p>
                Access your career dashboard and personalised
                recommendations.
              </p>
            </div>

            {authError && (
              <div className="auth-error">
                {authError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <label>Email address</label>

              <input
                type="email"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) =>
                  setLoginEmail(e.target.value)
                }
                required
              />

              <label>Password</label>

              <input
                type="password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) =>
                  setLoginPassword(e.target.value)
                }
                required
              />

              <button
                className="auth-submit"
                type="submit"
                disabled={authLoading}
              >
                <span>
                  {authLoading
                    ? "Signing in..."
                    : "Sign in"}
                </span>

                <b>→</b>
              </button>
            </form>

            <div className="auth-switch">
              Don't have an account?
              <button
                onClick={() => {
                  setAuthError("");
                  setPage("register");
                }}
              >
                Create one
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // REGISTER
  // ============================================================

  if (page === "register") {
    return (
      <div className="auth-page">
        <div className="auth-left">
          <button
            className="auth-back"
            onClick={() => setPage("landing")}
          >
            ← Back to TransConnect
          </button>

          <div className="auth-brand">
            <div className="landing-logo">T</div>
            <strong>TransConnect</strong>
          </div>

          <div className="auth-copy">
            <div className="landing-eyebrow">
              START YOUR JOURNEY
            </div>

            <h1>
              Build your path.
              <br />
              Find your place.
            </h1>

            <p>
              Create your account and turn your skills,
              experience and ambitions into a practical career
              journey.
            </p>

            <div className="register-progress">
              <div className="register-progress-top">
                <span>YOUR CAREER JOURNEY</span>
                <b>01 / 04</b>
              </div>

              <div className="register-progress-bar">
                <span />
              </div>

              <div className="register-steps">
                <span>Profile</span>
                <span>Match</span>
                <span>Learn</span>
                <span>Apply</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-heading">
              <div className="auth-mini-label">
                GET STARTED
              </div>

              <h2>Create account</h2>

              <p>
                Your account is the starting point for your
                personalised career experience.
              </p>
            </div>

            {authError && (
              <div className="auth-error">
                {authError}
              </div>
            )}

            <form onSubmit={handleRegister}>
              <label>Full name</label>

              <input
                type="text"
                placeholder="Your full name"
                value={registerName}
                onChange={(e) =>
                  setRegisterName(e.target.value)
                }
                required
              />

              <label>Email address</label>

              <input
                type="email"
                placeholder="you@example.com"
                value={registerEmail}
                onChange={(e) =>
                  setRegisterEmail(e.target.value)
                }
                required
              />

              <label>Password</label>

              <input
                type="password"
                placeholder="At least 6 characters"
                value={registerPassword}
                onChange={(e) =>
                  setRegisterPassword(e.target.value)
                }
                minLength="6"
                required
              />

              <button
                className="auth-submit"
                type="submit"
                disabled={authLoading}
              >
                <span>
                  {authLoading
                    ? "Creating account..."
                    : "Create account"}
                </span>

                <b>→</b>
              </button>
            </form>

            <div className="auth-switch">
              Already have an account?
              <button
                onClick={() => {
                  setAuthError("");
                  setPage("login");
                }}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // PORTAL
  // ============================================================

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>

          <div>
            <div className="brand-name">
              TransConnect
            </div>

            <div className="brand-subtitle">
              Career Intelligence
            </div>
          </div>
        </div>

        <div className="sidebar-section-label">
          WORKSPACE
        </div>

        <nav className="navigation">
          <button
            className={
              activePage === "jobs"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setActivePage("jobs")}
          >
            <span className="nav-icon">⌕</span>
            <span>Job Search</span>
          </button>

          <button
            className={
              activePage === "recommended"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => getRecommendations()}
          >
            <span className="nav-icon">✦</span>
            <span>Recommended</span>

            {recommendations.length > 0 && (
              <b className="nav-badge">
                {recommendations.length}
              </b>
            )}
          </button>

          <button
            className={
              activePage === "learning"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setActivePage("learning")}
          >
            <span className="nav-icon">◇</span>
            <span>Learning Path</span>
          </button>

          <button
            className={
              activePage === "applications"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setActivePage("applications")
            }
          >
            <span className="nav-icon">✓</span>
            <span>Applications</span>

            {applications.length > 0 && (
              <b className="nav-badge">
                {applications.length}
              </b>
            )}
          </button>
        </nav>

        <div className="sidebar-divider" />

        <button
          className="sidebar-ai-button"
          onClick={() => setShowChatbot(true)}
        >
          <div className="sidebar-ai-icon">✦</div>

          <div>
            <strong>Career Assistant</strong>
            <span>Ask anything about your career</span>
          </div>

          <b>→</b>
        </button>

        <div className="sidebar-bottom">
          <button
            className="profile-sidebar"
            onClick={openProfile}
          >
            <div className="avatar">
              {user?.name?.charAt(0)?.toUpperCase() ||
                "D"}
            </div>

            <div className="profile-sidebar-text">
              <strong>
                {user?.name || name || "Job Seeker"}
              </strong>

              <span>
                {profileCompletion}% profile complete
              </span>
            </div>

            <span className="arrow">›</span>
          </button>

          <button
            className="logout-button"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Career Portal</span>
            <b>/</b>
            <strong>{currentPageTitle}</strong>
          </div>

          <div className="topbar-right">
            <button
              className="saved-top-button"
              onClick={() => setActivePage("jobs")}
              title="Saved jobs"
            >
              ♡
              {savedJobs.length > 0 && (
                <i>{savedJobs.length}</i>
              )}
            </button>

            <button
              className="ai-top-button"
              onClick={() => setShowChatbot(true)}
            >
              <span>✦</span>
              Career Assistant
            </button>

            <button
              className="profile-button"
              onClick={openProfile}
            >
              <div className="avatar small">
                {user?.name?.charAt(0)?.toUpperCase() ||
                  "D"}
              </div>

              <span>
                {user?.name || name || "My Profile"}
              </span>

              <b>⌄</b>
            </button>
          </div>
        </header>

        <div className="content">
          {/* ================================================== */}
          {/* JOB SEARCH */}
          {/* ================================================== */}

          {activePage === "jobs" && (
            <>
              <section className="dashboard-welcome">
                <div>
                  <div className="eyebrow">
                    YOUR CAREER WORKSPACE
                  </div>

                  <h1>
                    Find your next
                    <br />
                    <span>opportunity.</span>
                  </h1>

                  <p>
                    Search real opportunities, compare your
                    fit and take the next step with confidence.
                  </p>

                  <div className="welcome-actions">
                    <button
                      className="primary-button"
                      onClick={() =>
                        setShowChatbot(true)
                      }
                    >
                      <span>✦</span>
                      Ask Career Assistant
                    </button>

                    <button
                      className="soft-button"
                      onClick={openProfile}
                    >
                      Complete profile
                      <span>{profileCompletion}%</span>
                    </button>
                  </div>
                </div>

                <div className="welcome-side-card">
                  <div className="welcome-side-top">
                    <span>PROFILE READINESS</span>
                    <b>{profileCompletion}%</b>
                  </div>

                  <div className="readiness-track">
                    <span
                      style={{
                        width: `${profileCompletion}%`,
                      }}
                    />
                  </div>

                  <p>
                    {profileCompletion >= 80
                      ? "Your profile is ready for stronger matching."
                      : "Complete your profile to improve job matching."}
                  </p>

                  <button onClick={openProfile}>
                    Improve my profile →
                  </button>
                </div>
              </section>

              <section className="search-panel-modern">
                <div className="search-field">
                  <span>⌕</span>

                  <input
                    type="text"
                    placeholder="Search by job title, company or skill"
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
                  />
                </div>

                <div className="search-field location">
                  <span>⌖</span>

                  <input
                    type="text"
                    placeholder="Location"
                    value={searchLocation}
                    onChange={(e) =>
                      setSearchLocation(e.target.value)
                    }
                  />
                </div>

                <button
                  className="search-main-button"
                  onClick={() => setActivePage("jobs")}
                >
                  Search jobs
                  <span>→</span>
                </button>
              </section>

              <section className="stats-modern">
                <div className="stat-modern">
                  <div className="stat-icon">⌕</div>

                  <div>
                    <span>Available positions</span>
                    <strong>
                      {loadingJobs ? "…" : jobs.length}
                    </strong>
                  </div>

                  <small>Live database</small>
                </div>

                <div className="stat-modern">
                  <div className="stat-icon star">✦</div>

                  <div>
                    <span>Recommended for you</span>
                    <strong>
                      {recommendations.length || "—"}
                    </strong>
                  </div>

                  <small>Profile matched</small>
                </div>

                <div className="stat-modern">
                  <div className="stat-icon check">✓</div>

                  <div>
                    <span>Applications</span>
                    <strong>
                      {applications.length}
                    </strong>
                  </div>

                  <small>Tracked applications</small>
                </div>

                <div className="stat-modern">
                  <div className="stat-icon skill">◇</div>

                  <div>
                    <span>Profile skills</span>
                    <strong>
                      {profileSkills.length}
                    </strong>
                  </div>

                  <small>
                    {profileCompletion}% complete
                  </small>
                </div>
              </section>

              <section className="section">
                <div className="section-heading-modern">
                  <div>
                    <div className="eyebrow">
                      OPPORTUNITIES
                    </div>

                    <h2>Latest opportunities</h2>

                    <p>
                      Explore roles that could be a strong
                      match for your career direction.
                    </p>
                  </div>

                  <div className="job-controls">
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value)
                      }
                    >
                      <option value="relevance">
                        Sort: Relevance
                      </option>

                      <option value="match">
                        Sort: Skill match
                      </option>

                      <option value="title">
                        Sort: Job title
                      </option>
                    </select>

                    <span>
                      {filteredJobs.length} result
                      {filteredJobs.length !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>
                </div>

                {loadingJobs ? (
                  <div className="loading-grid">
                    <div className="loading-card" />
                    <div className="loading-card" />
                    <div className="loading-card" />
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="empty-state-modern">
                    <div className="empty-large-icon">
                      ⌕
                    </div>

                    <h3>No matching opportunities</h3>

                    <p>
                      Try another keyword, location or clear
                      your filters.
                    </p>

                    <button
                      className="primary-button"
                      onClick={() => {
                        setSearch("");
                        setSearchLocation("");
                      }}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="job-grid-modern">
                    {filteredJobs.map((job) => {
                      const match = getJobMatch(
                        job,
                        profileSkills
                      );

                      const isSaved = savedJobs.includes(
                        String(job.id)
                      );

                      const isApplied =
                        applications.some(
                          (application) =>
                            String(application.job_id) ===
                            String(job.id)
                        );

                      return (
                        <article
                          className="job-card-modern"
                          key={job.id}
                        >
                          <div className="job-card-header">
                            <div className="company-logo-modern">
                              {String(
                                job.company || "C"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div className="job-card-header-right">
                              {match > 0 && (
                                <span className="match-pill">
                                  {match}% match
                                </span>
                              )}

                              <button
                                className={
                                  isSaved
                                    ? "save-button saved"
                                    : "save-button"
                                }
                                onClick={() =>
                                  toggleSaveJob(job)
                                }
                                title={
                                  isSaved
                                    ? "Remove saved job"
                                    : "Save job"
                                }
                              >
                                {isSaved ? "♥" : "♡"}
                              </button>
                            </div>
                          </div>

                          <div className="job-company-modern">
                            {job.company}
                          </div>

                          <h3>{job.title}</h3>

                          <div className="job-meta-row">
                            <span>
                              ⌖ {job.location || "Location not specified"}
                            </span>

                            {job.job_type && (
                              <span>
                                ◷ {job.job_type}
                              </span>
                            )}
                          </div>

                          <div className="skills-modern">
                            {getJobSkills(job)
                              .slice(0, 5)
                              .map((skill) => (
                                <span
                                  className="skill-modern"
                                  key={skill}
                                >
                                  {skill.trim()}
                                </span>
                              ))}
                          </div>

                          <p className="job-description-modern">
                            {job.description ||
                              "Explore this opportunity to see the role requirements, skills and career fit."}
                          </p>

                          <div className="job-card-footer">
                            <button
                              className="outline-button"
                              onClick={() =>
                                openJob(job)
                              }
                            >
                              View details
                            </button>

                            <button
                              className="primary-button"
                              onClick={() =>
                                openApply(job)
                              }
                            >
                              {isApplied
                                ? "Apply again"
                                : "Apply now"}
                              <span>→</span>
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ================================================== */}
          {/* RECOMMENDED */}
          {/* ================================================== */}

          {activePage === "recommended" && (
            <section className="section page-section">
              <div className="page-title-modern">
                <div>
                  <div className="eyebrow">
                    INTELLIGENT MATCHING
                  </div>

                  <h1>Recommended for you</h1>

                  <p>
                    Opportunities ranked using your profile
                    and skills.
                  </p>
                </div>

                <div className="page-title-actions">
                  <button
                    className="soft-button"
                    onClick={() =>
                      setShowChatbot(true)
                    }
                  >
                    <span>✦</span>
                    Ask why this matches
                  </button>

                  <button
                    className="primary-button"
                    onClick={getRecommendations}
                    disabled={loadingRecommendations}
                  >
                    {loadingRecommendations
                      ? "Analysing..."
                      : "Refresh matches"}
                    <span>↻</span>
                  </button>
                </div>
              </div>

              {recommendations.length === 0 ? (
                <div className="recommendation-empty">
                  <div className="recommendation-empty-icon">
                    ✦
                  </div>

                  <div>
                    <div className="eyebrow">
                      PERSONALISATION
                    </div>

                    <h3>
                      Build your profile to unlock
                      recommendations.
                    </h3>

                    <p>
                      Add your education, skills and experience
                      so TransConnect can identify stronger
                      career matches.
                    </p>

                    <button
                      className="primary-button"
                      onClick={openProfile}
                    >
                      Build my profile →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="recommendation-list-modern">
                  {recommendations.map(
                    (job, index) => {
                      const match =
                        Number(job.match_score) || 0;

                      return (
                        <article
                          className="recommendation-card-modern"
                          key={job.id}
                        >
                          <div className="recommendation-rank">
                            {String(index + 1).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <div className="company-logo-modern large">
                            {String(
                              job.company || "C"
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="recommendation-info-modern">
                            <span>
                              {job.company}
                            </span>

                            <h3>{job.title}</h3>

                            <p>
                              ⌖ {job.location}
                            </p>

                            <div className="skills-modern">
                              {getJobSkills(job)
                                .slice(0, 5)
                                .map((skill) => (
                                  <span
                                    className="skill-modern"
                                    key={skill}
                                  >
                                    {skill}
                                  </span>
                                ))}
                            </div>
                          </div>

                          <div className="recommendation-match">
                            <div className="match-header">
                              <span>
                                PROFILE MATCH
                              </span>

                              <strong>
                                {match}%
                              </strong>
                            </div>

                            <div className="match-bar-modern">
                              <span
                                style={{
                                  width: `${Math.min(
                                    match,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>

                            <small>
                              Based on your current
                              skills
                            </small>
                          </div>

                          <div className="recommendation-actions">
                            <button
                              className="outline-button"
                              onClick={() => {
                                setSelectedJob(
                                  String(job.id)
                                );
                                getSkillRecommendations(
                                  job.id
                                );
                              }}
                            >
                              Skill gap
                            </button>

                            <button
                              className="primary-button"
                              onClick={() =>
                                openApply(job)
                              }
                            >
                              Apply →
                            </button>
                          </div>
                        </article>
                      );
                    }
                  )}
                </div>
              )}
            </section>
          )}

          {/* ================================================== */}
          {/* LEARNING PATH */}
          {/* ================================================== */}

          {activePage === "learning" && (
            <section className="section page-section">
              <div className="page-title-modern">
                <div>
                  <div className="eyebrow">
                    SKILL INTELLIGENCE
                  </div>

                  <h1>Learning path</h1>

                  <p>
                    Understand exactly what you need to learn
                    for your target role.
                  </p>
                </div>

                <button
                  className="ai-outline-button"
                  onClick={() => setShowChatbot(true)}
                >
                  ✦ Ask Career Assistant
                </button>
              </div>

              <div className="learning-selector-modern">
                <div className="learning-selector-copy">
                  <span className="selector-step">
                    TARGET ROLE
                  </span>

                  <h3>
                    What role are you preparing for?
                  </h3>

                  <p>
                    Select any available opportunity to compare
                    its requirements against your profile.
                  </p>
                </div>

                <div className="learning-selector-controls">
                  <select
                    value={selectedJob}
                    onChange={(e) => {
                      setSelectedJob(e.target.value);
                      setSkillData(null);
                    }}
                  >
                    <option value="">
                      Choose a target job
                    </option>

                    {jobs.map((job) => (
                      <option
                        value={job.id}
                        key={job.id}
                      >
                        {job.title} — {job.company}
                      </option>
                    ))}
                  </select>

                  <button
                    className="primary-button"
                    onClick={() =>
                      getSkillRecommendations()
                    }
                    disabled={loadingSkills}
                  >
                    {loadingSkills
                      ? "Analysing..."
                      : "Analyse skill gap"}
                    <span>→</span>
                  </button>
                </div>
              </div>

              {!skillData ? (
                <div className="learning-start-card">
                  <div className="learning-start-icon">
                    ◇
                  </div>

                  <div>
                    <div className="eyebrow">
                      PERSONALIZED LEARNING
                    </div>

                    <h2>
                      Turn a target job into a learning plan.
                    </h2>

                    <p>
                      Select a role above. TransConnect will
                      compare the required skills with your
                      current profile and identify the highest
                      priority areas to develop.
                    </p>
                  </div>

                  <div className="learning-start-points">
                    <span>
                      <b>01</b>
                      Current skills
                    </span>

                    <span>
                      <b>02</b>
                      Missing skills
                    </span>

                    <span>
                      <b>03</b>
                      Recommended courses
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="learning-overview-modern">
                    <div className="learning-overview-copy">
                      <div className="eyebrow">
                        CURRENT ROLE READINESS
                      </div>

                      <h2>
                        {Math.round(
                          skillData.skill_match || 0
                        )}
                        % ready
                      </h2>

                      <p>
                        Complete the missing skills below to
                        improve your alignment with the target
                        role.
                      </p>

                      <div className="learning-status-row">
                        <span>
                          ✓{" "}
                          {skillData.user_skills?.length ||
                            0}{" "}
                          skills covered
                        </span>

                        <span>
                          +{" "}
                          {skillData.missing_skills
                            ?.length || 0}{" "}
                          skills to develop
                        </span>
                      </div>
                    </div>

                    <div
                      className="large-progress-ring"
                      style={{
                        "--progress": `${Math.min(
                          Number(
                            skillData.skill_match || 0
                          ),
                          100
                        ) * 3.6}deg`,
                      }}
                    >
                      <div>
                        <strong>
                          {Math.round(
                            skillData.skill_match || 0
                          )}
                        </strong>
                        <span>%</span>
                      </div>
                    </div>
                  </div>

                  <div className="learning-grid-modern">
                    <div className="learning-card-modern">
                      <div className="learning-card-heading">
                        <div>
                          <span className="card-label green-label">
                            ALREADY COVERED
                          </span>

                          <h3>Your current skills</h3>

                          <p>
                            Skills already present in your
                            profile.
                          </p>
                        </div>

                        <b className="skill-count green-count">
                          {skillData.user_skills?.length ||
                            0}
                        </b>
                      </div>

                      <div className="skill-list-modern">
                        {skillData.user_skills?.length ? (
                          skillData.user_skills.map(
                            (skill) => (
                              <div
                                className="skill-row-modern completed"
                                key={skill}
                              >
                                <span>✓</span>
                                <strong>{skill}</strong>
                                <small>Covered</small>
                              </div>
                            )
                          )
                        ) : (
                          <div className="no-skill-message">
                            No skills detected in your
                            profile yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="learning-card-modern">
                      <div className="learning-card-heading">
                        <div>
                          <span className="card-label orange-label">
                            PRIORITY AREAS
                          </span>

                          <h3>Skills to develop</h3>

                          <p>
                            Skills required for your target
                            role that need attention.
                          </p>
                        </div>

                        <b className="skill-count orange-count">
                          {skillData.missing_skills
                            ?.length || 0}
                        </b>
                      </div>

                      <div className="skill-list-modern">
                        {skillData.missing_skills?.length ? (
                          skillData.missing_skills.map(
                            (skill, index) => (
                              <div
                                className="skill-row-modern missing"
                                key={skill}
                              >
                                <span>{index + 1}</span>
                                <strong>{skill}</strong>
                                <small>
                                  Learn
                                </small>
                              </div>
                            )
                          )
                        ) : (
                          <div className="complete-message-modern">
                            <span>✓</span>

                            <div>
                              <strong>
                                You're ready for this
                                role.
                              </strong>

                              <p>
                                Your current skills cover
                                the analysed requirements.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {skillData.recommended_courses
                    ?.length > 0 && (
                    <div className="courses-section-modern">
                      <div className="section-heading-modern">
                        <div>
                          <div className="eyebrow">
                            RECOMMENDED LEARNING
                          </div>

                          <h2>
                            Courses for your skill gap
                          </h2>

                          <p>
                            Learning resources selected around
                            the areas you need to develop.
                          </p>
                        </div>
                      </div>

                      <div className="course-grid-modern">
                        {skillData.recommended_courses.map(
                          (course) => (
                            <article
                              className="course-card-modern"
                              key={course.id}
                            >
                              <div className="course-card-top">
                                <span>
                                  {course.skill}
                                </span>

                                <small>
                                  {course.duration}
                                </small>
                              </div>

                              <h3>
                                {course.course_name}
                              </h3>

                              <p>
                                {course.platform} ·{" "}
                                {course.level}
                              </p>

                              <a
                                href={course.course_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Start learning
                                <span>→</span>
                              </a>
                            </article>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ================================================== */}
          {/* APPLICATIONS */}
          {/* ================================================== */}

          {activePage === "applications" && (
            <section className="section page-section">
              <div className="page-title-modern">
                <div>
                  <div className="eyebrow">
                    APPLICATION MANAGEMENT
                  </div>

                  <h1>Application tracker</h1>

                  <p>
                    Every opportunity you apply for, organised
                    in one place.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={() =>
                    setActivePage("jobs")
                  }
                >
                  Find more jobs →
                </button>
              </div>

              <div className="application-summary">
                <div>
                  <span>Total applications</span>
                  <strong>{applications.length}</strong>
                </div>

                <div>
                  <span>Under review</span>
                  <strong>
                    {
                      applications.filter(
                        (application) =>
                          application.status ===
                          "Under Review"
                      ).length
                    }
                  </strong>
                </div>

                <div>
                  <span>Interviews</span>
                  <strong>
                    {
                      applications.filter(
                        (application) =>
                          application.status ===
                          "Interview"
                      ).length
                    }
                  </strong>
                </div>

                <div>
                  <span>Selected</span>
                  <strong>
                    {
                      applications.filter(
                        (application) =>
                          application.status ===
                          "Selected"
                      ).length
                    }
                  </strong>
                </div>
              </div>

              {applications.length === 0 ? (
                <div className="empty-state-modern application-empty">
                  <div className="empty-large-icon">
                    ✓
                  </div>

                  <div>
                    <h3>Your application journey starts here.</h3>

                    <p>
                      Find an opportunity you like, submit your
                      application and track the journey from
                      this dashboard.
                    </p>

                    <button
                      className="primary-button"
                      onClick={() =>
                        setActivePage("jobs")
                      }
                    >
                      Explore opportunities →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="applications-list-modern">
                  {applications.map((application) => (
                    <article
                      className="application-card-modern"
                      key={application.id}
                    >
                      <div className="application-company">
                        {String(
                          application.company || "C"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="application-info">
                        <div className="eyebrow">
                          {application.company}
                        </div>

                        <h3>
                          {application.title}
                        </h3>

                        <p>
                          ⌖{" "}
                          {application.location ||
                            "Location not specified"}
                        </p>

                        <small>
                          Applied{" "}
                          {new Date(
                            application.applied_at
                          ).toLocaleDateString()}
                        </small>
                      </div>

                      <div className="application-progress">
                        <div className="application-status-line">
                          {[
                            "Applied",
                            "Under Review",
                            "Interview",
                            "Selected",
                          ].map((status) => {
                            const statuses = [
                              "Applied",
                              "Under Review",
                              "Interview",
                              "Selected",
                            ];

                            const currentIndex =
                              statuses.indexOf(
                                application.status
                              );

                            const statusIndex =
                              statuses.indexOf(
                                status
                              );

                            const active =
                              statusIndex <=
                              currentIndex &&
                              application.status !==
                                "Rejected";

                            return (
                              <div
                                className={
                                  active
                                    ? "status-step active"
                                    : "status-step"
                                }
                                key={status}
                              >
                                <span>
                                  {active ? "✓" : ""}
                                </span>

                                <small>
                                  {status}
                                </small>
                              </div>
                            );
                          })}
                        </div>

                        {application.status ===
                          "Rejected" && (
                          <div className="rejected-status">
                            Application closed
                          </div>
                        )}
                      </div>

                      <div className="application-actions">
                        <select
                          value={application.status}
                          onChange={(e) =>
                            updateApplicationStatus(
                              application.id,
                              e.target.value
                            )
                          }
                        >
                          <option value="Applied">
                            Applied
                          </option>

                          <option value="Under Review">
                            Under Review
                          </option>

                          <option value="Interview">
                            Interview
                          </option>

                          <option value="Selected">
                            Selected
                          </option>

                          <option value="Rejected">
                            Rejected
                          </option>
                        </select>

                        <button
                          className="delete-application"
                          onClick={() =>
                            removeApplication(
                              application.id
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ====================================================== */}
      {/* JOB DETAILS MODAL */}
      {/* ====================================================== */}

      {showJobDetails && selectedJobObject && (
        <div
          className="modal-overlay"
          onClick={() => setShowJobDetails(false)}
        >
          <div
            className="job-details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-close-row">
              <span>OPPORTUNITY DETAILS</span>

              <button
                className="modal-close"
                onClick={() =>
                  setShowJobDetails(false)
                }
              >
                ×
              </button>
            </div>

            <div className="job-details-heading">
              <div className="company-logo-modern xl">
                {String(
                  selectedJobObject.company || "C"
                )
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <span>
                  {selectedJobObject.company}
                </span>

                <h2>{selectedJobObject.title}</h2>

                <p>
                  ⌖ {selectedJobObject.location}
                </p>
              </div>
            </div>

            <div className="job-details-grid">
              <div>
                <span>ROLE TYPE</span>
                <strong>
                  {selectedJobObject.job_type ||
                    "Full-time"}
                </strong>
              </div>

              <div>
                <span>SKILL MATCH</span>
                <strong>
                  {getJobMatch(
                    selectedJobObject,
                    profileSkills
                  )}
                  %
                </strong>
              </div>

              <div>
                <span>SKILLS</span>
                <strong>
                  {getJobSkills(
                    selectedJobObject
                  ).length}
                </strong>
              </div>
            </div>

            <div className="job-details-body">
              <div>
                <h3>About this opportunity</h3>

                <p>
                  {selectedJobObject.description ||
                    "No detailed description is available yet."}
                </p>
              </div>

              <div>
                <h3>Required skills</h3>

                <div className="details-skills">
                  {getJobSkills(
                    selectedJobObject
                  ).map((skill) => (
                    <span key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer-actions">
              <button
                className="outline-button large"
                onClick={() => {
                  setShowJobDetails(false);
                  getSkillRecommendations(
                    selectedJobObject.id
                  );
                }}
              >
                Analyse skill gap
              </button>

              <button
                className="primary-button large"
                onClick={() => {
                  setShowJobDetails(false);
                  openApply(selectedJobObject);
                }}
              >
                Apply for this role →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* APPLICATION MODAL */}
      {/* ====================================================== */}

      {showApply && selectedJobObject && (
        <div
          className="modal-overlay"
          onClick={() => setShowApply(false)}
        >
          <div
            className="application-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-close-row">
              <div>
                <span>APPLICATION</span>

                <h2>
                  Apply for {selectedJobObject.title}
                </h2>

                <p>
                  {selectedJobObject.company}
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowApply(false)}
              >
                ×
              </button>
            </div>

            <form
              className="application-form"
              onSubmit={submitApplication}
            >
              <div className="form-section-title">
                YOUR DETAILS
              </div>

              <div className="form-grid-two">
                <div>
                  <label>Full name</label>

                  <input
                    value={applicationName}
                    onChange={(e) =>
                      setApplicationName(
                        e.target.value
                      )
                    }
                    required
                  />
                </div>

                <div>
                  <label>Email</label>

                  <input
                    type="email"
                    value={applicationEmail}
                    onChange={(e) =>
                      setApplicationEmail(
                        e.target.value
                      )
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <label>Phone number</label>

                <input
                  value={applicationPhone}
                  onChange={(e) =>
                    setApplicationPhone(
                      e.target.value
                    )
                  }
                  placeholder="Your contact number"
                />
              </div>

              <div>
                <label>Resume</label>

                <div className="application-resume-box">
                  <div className="resume-file-icon">
                    PDF
                  </div>

                  <div>
                    <strong>
                      {resume?.name ||
                        "No resume uploaded"}
                    </strong>

                    <span>
                      {resume
                        ? "Ready to attach to your application"
                        : "Upload your resume from My Profile"}
                    </span>
                  </div>

                  {!resume && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowApply(false);
                        openProfile();
                        setProfileTab("resume");
                      }}
                    >
                      Upload
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label>
                  Why are you interested in this role?
                </label>

                <textarea
                  rows="5"
                  placeholder="Briefly explain your interest and relevant experience..."
                  value={coverLetter}
                  onChange={(e) =>
                    setCoverLetter(
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="application-submit-note">
                <span>✓</span>

                <p>
                  Your application will also be added to
                  your TransConnect Application Tracker.
                </p>
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="outline-button large"
                  onClick={() =>
                    setShowApply(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button large"
                >
                  Submit application →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* PROFILE MODAL */}
      {/* ====================================================== */}

      {showProfile && (
        <div
          className="modal-overlay profile-overlay"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="profile-modal-modern"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div>
                <div className="eyebrow">
                  PROFESSIONAL PROFILE
                </div>

                <h2>
                  {name || user?.name || "Your profile"}
                </h2>

                <p>
                  Build a stronger profile for better career
                  matching.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setShowProfile(false)
                }
              >
                ×
              </button>
            </div>

            <div className="profile-layout">
              <aside className="profile-tabs">
                <button
                  className={
                    profileTab === "overview"
                      ? "profile-tab active"
                      : "profile-tab"
                  }
                  onClick={() =>
                    setProfileTab("overview")
                  }
                >
                  <span>◉</span>
                  Overview
                </button>

                <button
                  className={
                    profileTab === "professional"
                      ? "profile-tab active"
                      : "profile-tab"
                  }
                  onClick={() =>
                    setProfileTab("professional")
                  }
                >
                  <span>◆</span>
                  Professional
                </button>

                <button
                  className={
                    profileTab === "resume"
                      ? "profile-tab active"
                      : "profile-tab"
                  }
                  onClick={() =>
                    setProfileTab("resume")
                  }
                >
                  <span>□</span>
                  Resume
                </button>

                <button
                  className={
                    profileTab === "skills"
                      ? "profile-tab active"
                      : "profile-tab"
                  }
                  onClick={() =>
                    setProfileTab("skills")
                  }
                >
                  <span>◇</span>
                  Skills
                </button>

                <div className="profile-completion-card">
                  <div className="completion-top">
                    <span>PROFILE</span>
                    <strong>
                      {profileCompletion}%
                    </strong>
                  </div>

                  <div className="completion-bar">
                    <span
                      style={{
                        width: `${profileCompletion}%`,
                      }}
                    />
                  </div>

                  <p>
                    {profileCompletion >= 80
                      ? "Excellent. Your profile is ready for matching."
                      : "Complete more sections to improve your recommendations."}
                  </p>
                </div>
              </aside>

              <div className="profile-content-modern">
                {profileTab === "overview" && (
                  <div>
                    <div className="profile-hero-card">
                      <div className="profile-avatar-large">
                        {name
                          ?.charAt(0)
                          ?.toUpperCase() ||
                          "D"}
                      </div>

                      <div>
                        <span>
                          {profileExtras.headline ||
                            "Add a professional headline"}
                        </span>

                        <h3>
                          {name ||
                            user?.name ||
                            "Your Name"}
                        </h3>

                        <p>
                          {profileExtras.location ||
                            "Add your preferred location"}
                        </p>
                      </div>

                      <div className="profile-score">
                        <strong>
                          {profileCompletion}%
                        </strong>

                        <span>
                          profile complete
                        </span>
                      </div>
                    </div>

                    <div className="profile-section-block">
                      <div className="profile-block-heading">
                        <div>
                          <span>ABOUT YOU</span>
                          <h3>Professional summary</h3>
                        </div>

                        <button
                          onClick={() =>
                            setProfileTab(
                              "professional"
                            )
                          }
                        >
                          Edit →
                        </button>
                      </div>

                      <p className="profile-summary-text">
                        {profileExtras.summary ||
                          "Add a concise professional summary describing your background, strengths and career direction."}
                      </p>
                    </div>

                    <div className="profile-two-column">
                      <div className="profile-info-card">
                        <span>EDUCATION</span>

                        <strong>
                          {education ||
                            "Not added yet"}
                        </strong>
                      </div>

                      <div className="profile-info-card">
                        <span>TARGET ROLE</span>

                        <strong>
                          {profileExtras.targetRole ||
                            "Not added yet"}
                        </strong>
                      </div>

                      <div className="profile-info-card">
                        <span>EXPERIENCE</span>

                        <strong>
                          {experience
                            ? "Added"
                            : "Not added yet"}
                        </strong>
                      </div>

                      <div className="profile-info-card">
                        <span>RESUME</span>

                        <strong>
                          {resume
                            ? "Uploaded"
                            : "Not uploaded"}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {profileTab === "professional" && (
                  <form
                    onSubmit={createProfile}
                    className="professional-form"
                  >
                    <div className="profile-form-heading">
                      <div>
                        <span>
                          PROFESSIONAL INFORMATION
                        </span>

                        <h3>
                          Tell employers who you are.
                        </h3>

                        <p>
                          These details help TransConnect
                          understand your career direction.
                        </p>
                      </div>
                    </div>

                    <div className="form-grid-two">
                      <div>
                        <label>Full name</label>

                        <input
                          value={name}
                          onChange={(e) =>
                            setName(e.target.value)
                          }
                          placeholder="Your full name"
                          required
                        />
                      </div>

                      <div>
                        <label>
                          Professional headline
                        </label>

                        <input
                          value={
                            profileExtras.headline
                          }
                          onChange={(e) =>
                            updateExtra(
                              "headline",
                              e.target.value
                            )
                          }
                          placeholder="e.g. Aspiring Data Analyst"
                        />
                      </div>
                    </div>

                    <div className="form-grid-two">
                      <div>
                        <label>Education</label>

                        <input
                          value={education}
                          onChange={(e) =>
                            setEducation(
                              e.target.value
                            )
                          }
                          placeholder="e.g. B.Tech Information Technology"
                        />
                      </div>

                      <div>
                        <label>Target role</label>

                        <input
                          value={
                            profileExtras.targetRole
                          }
                          onChange={(e) =>
                            updateExtra(
                              "targetRole",
                              e.target.value
                            )
                          }
                          placeholder="e.g. Data Analyst"
                        />
                      </div>
                    </div>

                    <div className="form-grid-two">
                      <div>
                        <label>Phone</label>

                        <input
                          value={
                            profileExtras.phone
                          }
                          onChange={(e) =>
                            updateExtra(
                              "phone",
                              e.target.value
                            )
                          }
                          placeholder="Your phone number"
                        />
                      </div>

                      <div>
                        <label>Location</label>

                        <input
                          value={
                            profileExtras.location
                          }
                          onChange={(e) =>
                            updateExtra(
                              "location",
                              e.target.value
                            )
                          }
                          placeholder="City, State"
                        />
                      </div>
                    </div>

                    <div>
                      <label>Professional summary</label>

                      <textarea
                        rows="5"
                        value={
                          profileExtras.summary
                        }
                        onChange={(e) =>
                          updateExtra(
                            "summary",
                            e.target.value
                          )
                        }
                        placeholder="Write 3–5 lines about your background, strengths, interests and career goals."
                      />
                    </div>

                    <div>
                      <label>Experience</label>

                      <textarea
                        rows="5"
                        value={experience}
                        onChange={(e) =>
                          setExperience(
                            e.target.value
                          )
                        }
                        placeholder="Describe internships, projects, work experience or relevant practical experience."
                      />
                    </div>

                    <div className="form-grid-two">
                      <div>
                        <label>LinkedIn</label>

                        <input
                          value={
                            profileExtras.linkedin
                          }
                          onChange={(e) =>
                            updateExtra(
                              "linkedin",
                              e.target.value
                            )
                          }
                          placeholder="LinkedIn profile"
                        />
                      </div>

                      <div>
                        <label>GitHub</label>

                        <input
                          value={
                            profileExtras.github
                          }
                          onChange={(e) =>
                            updateExtra(
                              "github",
                              e.target.value
                            )
                          }
                          placeholder="GitHub profile"
                        />
                      </div>
                    </div>

                    <div>
                      <label>Portfolio</label>

                      <input
                        value={
                          profileExtras.portfolio
                        }
                        onChange={(e) =>
                          updateExtra(
                            "portfolio",
                            e.target.value
                          )
                        }
                        placeholder="Portfolio website"
                      />
                    </div>

                    <button
                      className="primary-button full"
                      type="submit"
                    >
                      Save professional profile →
                    </button>
                  </form>
                )}

                {profileTab === "resume" && (
                  <div className="resume-section-modern">
                    <div className="profile-form-heading">
                      <div>
                        <span>RESUME</span>

                        <h3>
                          Keep your professional resume ready.
                        </h3>

                        <p>
                          Upload the latest version of your
                          resume so you can use it when applying
                          for opportunities.
                        </p>
                      </div>
                    </div>

                    {!resume ? (
                      <div
                        className="resume-upload-area"
                        onClick={() =>
                          fileInputRef.current?.click()
                        }
                      >
                        <div className="resume-upload-icon">
                          ↑
                        </div>

                        <h4>
                          Upload your resume
                        </h4>

                        <p>
                          PDF, DOC or DOCX · Maximum 5 MB
                        </p>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                        >
                          Choose file
                        </button>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={handleResumeUpload}
                          hidden
                        />
                      </div>
                    ) : (
                      <div className="resume-uploaded-card">
                        <div className="resume-document-icon">
                          PDF
                        </div>

                        <div className="resume-file-details">
                          <strong>{resume.name}</strong>

                          <span>
                            {resume.type ||
                              "Document"}{" "}
                            ·{" "}
                            {Math.max(
                              1,
                              Math.round(
                                resume.size / 1024
                              )
                            )}{" "}
                            KB
                          </span>

                          <small>
                            Uploaded{" "}
                            {new Date(
                              resume.uploadedAt
                            ).toLocaleDateString()}
                          </small>
                        </div>

                        <div className="resume-actions">
                          <button
                            onClick={() =>
                              fileInputRef.current?.click()
                            }
                          >
                            Replace
                          </button>

                          <button
                            className="danger-text"
                            onClick={removeResume}
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={handleResumeUpload}
                          hidden
                        />
                      </div>
                    )}

                    <div className="resume-professional-details">
                      <div className="resume-detail-heading">
                        <span>
                          PROFESSIONAL DETAILS
                        </span>

                        <button
                          onClick={() =>
                            setProfileTab(
                              "professional"
                            )
                          }
                        >
                          Edit details →
                        </button>
                      </div>

                      <div className="resume-details-grid">
                        <div>
                          <span>NAME</span>
                          <strong>
                            {name || "Not added"}
                          </strong>
                        </div>

                        <div>
                          <span>HEADLINE</span>
                          <strong>
                            {profileExtras.headline ||
                              "Not added"}
                          </strong>
                        </div>

                        <div>
                          <span>EDUCATION</span>
                          <strong>
                            {education ||
                              "Not added"}
                          </strong>
                        </div>

                        <div>
                          <span>TARGET ROLE</span>
                          <strong>
                            {profileExtras.targetRole ||
                              "Not added"}
                          </strong>
                        </div>

                        <div>
                          <span>EMAIL</span>
                          <strong>
                            {user?.email ||
                              "Not available"}
                          </strong>
                        </div>

                        <div>
                          <span>PHONE</span>
                          <strong>
                            {profileExtras.phone ||
                              "Not added"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {profileTab === "skills" && (
                  <div className="skills-profile-section">
                    <div className="profile-form-heading">
                      <div>
                        <span>SKILL PROFILE</span>

                        <h3>
                          Your professional skill set.
                        </h3>

                        <p>
                          These skills are used by the
                          recommendation and skill-gap systems.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label>
                        Skills
                      </label>

                      <textarea
                        rows="5"
                        value={skills}
                        onChange={(e) =>
                          setSkills(
                            e.target.value
                          )
                        }
                        placeholder="Python, SQL, React, Excel, Machine Learning..."
                      />
                    </div>

                    <div className="skill-preview">
                      {profileSkills.length ? (
                        profileSkills.map((skill) => (
                          <span key={skill}>
                            ✓ {skill}
                          </span>
                        ))
                      ) : (
                        <p>
                          Add your skills above to build
                          your professional skill profile.
                        </p>
                      )}
                    </div>

                    <button
                      className="primary-button full"
                      onClick={async () => {
                        try {
                          await axios.post(
                            `${API}/api/profiles`,
                            {
                              name,
                              education,
                              skills,
                              experience,
                            }
                          );

                          showToast(
                            "Skills updated successfully."
                          );
                        } catch (error) {
                          showToast(
                            "Unable to save skills."
                          );
                        }
                      }}
                    >
                      Save skills →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* CHATBOT */}
      {/* ====================================================== */}

      {showChatbot && (
        <div className="chatbot-shell">
          <div className="chatbot-header">
            <div className="chatbot-brand">
              <div className="chatbot-icon">
                ✦
              </div>

              <div>
                <strong>Career Assistant</strong>
                <span>
                  Personalised TransConnect guidance
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowChatbot(false)}
            >
              ×
            </button>
          </div>

          <div className="chatbot-suggestions">
            <button
              onClick={() => {
                setChatInput(
                  "Which jobs are best for me?"
                );
              }}
            >
              Best jobs for me
            </button>

            <button
              onClick={() => {
                setChatInput(
                  "What skills do I need for Data Analyst?"
                );
              }}
            >
              Data Analyst skills
            </button>

            <button
              onClick={() => {
                setChatInput(
                  "How can I improve my profile?"
                );
              }}
            >
              Improve my profile
            </button>
          </div>

          <div className="chatbot-messages">
            {chatMessages.map((message, index) => (
              <div
                className={
                  message.sender === "user"
                    ? "chat-message user"
                    : "chat-message bot"
                }
                key={index}
              >
                {message.sender === "bot" && (
                  <div className="message-avatar">
                    ✦
                  </div>
                )}

                <div className="message-bubble">
                  {message.text
                    .split("\n")
                    .map((line, lineIndex) => (
                      <span key={lineIndex}>
                        {line}
                        {lineIndex <
                          message.text.split(
                            "\n"
                          ).length -
                            1 && <br />}
                      </span>
                    ))}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="chat-message bot">
                <div className="message-avatar">
                  ✦
                </div>

                <div className="message-bubble typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <form
            className="chatbot-input-area"
            onSubmit={askChatbot}
          >
            <input
              value={chatInput}
              onChange={(e) =>
                setChatInput(e.target.value)
              }
              placeholder="Ask about jobs, skills, courses..."
            />

            <button
              type="submit"
              disabled={chatLoading}
            >
              ↑
            </button>
          </form>
        </div>
      )}

      {/* ====================================================== */}
      {/* TOAST */}
      {/* ====================================================== */}

      {toast && (
        <div className="toast-modern">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;