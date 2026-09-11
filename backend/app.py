from flask import Flask, jsonify, request, session
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
import os
import re


# =========================================================
# APP CONFIGURATION
# =========================================================

app = Flask(__name__)

app.secret_key = os.getenv(
    "SECRET_KEY",
    "transconnect-secret-key-change-this"
)

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:5173",
        "http://localhost:5174"
    ]
)


# =========================================================
# DATABASE
# =========================================================

conn = psycopg2.connect(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "transconnect"),
    user=os.getenv("DB_USER", "postgres"),
    password=os.getenv("DB_PASSWORD", "Tvi@2007")
)


# =========================================================
# DATABASE HELPER
# =========================================================

def get_cursor():
    return conn.cursor()


def get_current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    cur = get_cursor()

    cur.execute(
        """
        SELECT id, name, email
        FROM users
        WHERE id = %s
        """,
        (user_id,)
    )

    user = cur.fetchone()

    cur.close()

    return user


def resolve_profile_id(identifier):
    """Resolve either a user id or a profile id to the actual profile id."""
    if not identifier:
        return None

    cur = get_cursor()

    # The frontend normally sends the logged-in user id.
    cur.execute(
        "SELECT id FROM profiles WHERE user_id = %s LIMIT 1",
        (identifier,)
    )
    row = cur.fetchone()

    if row:
        cur.close()
        return row[0]

    # Backwards compatibility: also accept an actual profile id.
    cur.execute(
        "SELECT id FROM profiles WHERE id = %s LIMIT 1",
        (identifier,)
    )
    row = cur.fetchone()
    cur.close()

    return row[0] if row else None


def row_to_job(row):
    return {
        "id": row[0],
        "title": row[1],
        "company": row[2],
        "location": row[3],
        "skills": row[4] or "",
        "description": row[5] or ""
    }


def normalize_skills(value):
    if not value:
        return []

    if isinstance(value, list):
        text = " ".join(str(x) for x in value)
    else:
        text = str(value)

    text = text.lower()

    text = text.replace("/", ",")
    text = text.replace("|", ",")
    text = text.replace(";", ",")

    skills = []

    for item in text.split(","):
        item = item.strip()

        if item:
            skills.append(item)

    return skills


def extract_skill_tokens(text):
    """
    Extract useful technology / professional skill keywords.
    This keeps the recommendation engine useful without requiring
    an external LLM API key.
    """

    if not text:
        return set()

    text = str(text).lower()

    known_skills = [
        "python",
        "java",
        "javascript",
        "typescript",
        "c",
        "c++",
        "c#",
        "html",
        "css",
        "react",
        "react.js",
        "node",
        "node.js",
        "express",
        "flask",
        "django",
        "spring",
        "sql",
        "mysql",
        "postgresql",
        "mongodb",
        "database",
        "dbms",
        "git",
        "github",
        "docker",
        "kubernetes",
        "aws",
        "azure",
        "machine learning",
        "deep learning",
        "artificial intelligence",
        "ai",
        "data analysis",
        "data analytics",
        "data science",
        "tableau",
        "power bi",
        "excel",
        "pandas",
        "numpy",
        "scikit-learn",
        "tensorflow",
        "pytorch",
        "nlp",
        "natural language processing",
        "computer vision",
        "figma",
        "ui/ux",
        "flutter",
        "android",
        "rest api",
        "api",
        "linux",
        "operating systems",
        "data structures",
        "algorithms",
        "problem solving",
        "communication",
        "leadership",
        "teamwork",
        "project management"
    ]

    found = set()

    for skill in known_skills:
        pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"

        if re.search(pattern, text):
            found.add(skill)

    return found


def calculate_skill_match(user_skills, job_skills):
    user_set = extract_skill_tokens(user_skills)
    job_set = extract_skill_tokens(job_skills)

    if not job_set:
        return 0, [], []

    matched = sorted(user_set.intersection(job_set))
    missing = sorted(job_set - user_set)

    score = round((len(matched) / len(job_set)) * 100, 2)

    return score, matched, missing


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():
    return jsonify({
        "message": "TransConnect API is running",
        "status": "online",
        "version": "2.0"
    })


# =========================================================
# REGISTER
# =========================================================

@app.route("/api/auth/register", methods=["POST"])
def register():

    data = request.get_json() or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({
            "error": "Name, email and password are required"
        }), 400

    if len(password) < 6:
        return jsonify({
            "error": "Password must contain at least 6 characters"
        }), 400

    cur = get_cursor()

    cur.execute(
        """
        SELECT id
        FROM users
        WHERE email = %s
        """,
        (email,)
    )

    existing_user = cur.fetchone()

    if existing_user:
        cur.close()

        return jsonify({
            "error": "An account with this email already exists"
        }), 409

    password_hash = generate_password_hash(password)

    cur.execute(
        """
        INSERT INTO users
        (name, email, password_hash)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (name, email, password_hash)
    )

    user_id = cur.fetchone()[0]

    conn.commit()
    cur.close()

    return jsonify({
        "message": "Account created successfully",
        "user_id": user_id
    }), 201


# =========================================================
# LOGIN
# =========================================================

@app.route("/api/auth/login", methods=["POST"])
def login():

    data = request.get_json() or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({
            "error": "Email and password are required"
        }), 400

    cur = get_cursor()

    cur.execute(
        """
        SELECT id, name, email, password_hash
        FROM users
        WHERE email = %s
        """,
        (email,)
    )

    user = cur.fetchone()

    cur.close()

    if not user:
        return jsonify({
            "error": "Invalid email or password"
        }), 401

    user_id, name, user_email, password_hash = user

    if not check_password_hash(password_hash, password):
        return jsonify({
            "error": "Invalid email or password"
        }), 401

    session["user_id"] = user_id

    return jsonify({
        "message": "Login successful",
        "user": {
            "id": user_id,
            "name": name,
            "email": user_email
        }
    }), 200


# =========================================================
# LOGOUT
# =========================================================

@app.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "message": "Logged out successfully"
    })


# =========================================================
# CURRENT USER
# =========================================================

@app.route("/api/auth/me", methods=["GET"])
def current_user():

    user = get_current_user()

    if not user:
        return jsonify({
            "authenticated": False
        }), 401

    return jsonify({
        "authenticated": True,
        "user": {
            "id": user[0],
            "name": user[1],
            "email": user[2]
        }
    })


# =========================================================
# JOBS
# =========================================================

@app.route("/api/jobs", methods=["GET"])
def get_jobs():

    search = request.args.get("search", "").strip()
    location = request.args.get("location", "").strip()

    cur = get_cursor()

    query = """
        SELECT *
        FROM jobs
    """

    conditions = []
    values = []

    if search:
        conditions.append(
            """
            (
                LOWER(title) LIKE LOWER(%s)
                OR LOWER(company) LIKE LOWER(%s)
                OR LOWER(skills) LIKE LOWER(%s)
                OR LOWER(description) LIKE LOWER(%s)
            )
            """
        )

        keyword = f"%{search}%"

        values.extend([
            keyword,
            keyword,
            keyword,
            keyword
        ])

    if location:
        conditions.append(
            "LOWER(location) LIKE LOWER(%s)"
        )

        values.append(f"%{location}%")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY id DESC"

    cur.execute(query, tuple(values))

    rows = cur.fetchall()

    cur.close()

    jobs = [row_to_job(row) for row in rows]

    return jsonify(jobs)


# =========================================================
# SINGLE JOB
# =========================================================

@app.route("/api/jobs/<int:job_id>", methods=["GET"])
def get_single_job(job_id):

    cur = get_cursor()

    cur.execute(
        """
        SELECT *
        FROM jobs
        WHERE id = %s
        """,
        (job_id,)
    )

    row = cur.fetchone()

    cur.close()

    if not row:
        return jsonify({
            "error": "Job not found"
        }), 404

    return jsonify(row_to_job(row))


# =========================================================
# APPLICATION SUBMISSION
# =========================================================

@app.route("/api/applications", methods=["POST"])
def submit_application():

    data = request.get_json() or {}

    name = data.get("name")
    email = data.get("email")
    resume_url = data.get("resume_url")
    job_id = data.get("job_id")

    if not name or not email or not resume_url or not job_id:
        return jsonify({
            "error": "All fields are required"
        }), 400

    cur = get_cursor()

    cur.execute(
        """
        SELECT id
        FROM jobs
        WHERE id = %s
        """,
        (job_id,)
    )

    job = cur.fetchone()

    if not job:
        cur.close()

        return jsonify({
            "error": "Job not found"
        }), 404

    cur.execute(
        """
        INSERT INTO applications
        (job_id, name, email, resume_url)
        VALUES (%s, %s, %s, %s)
        """,
        (
            job_id,
            name,
            email,
            resume_url
        )
    )

    conn.commit()
    cur.close()

    return jsonify({
        "message": "Application submitted successfully!"
    }), 201


# =========================================================
# PROFILE
# =========================================================

@app.route("/api/profiles", methods=["POST"])
def create_profile():

    data = request.get_json() or {}

    name = data.get("name")
    education = data.get("education")
    skills = data.get("skills")
    experience = data.get("experience")

    user_id = session.get("user_id")

    if not name:
        return jsonify({
            "error": "Name is required"
        }), 400

    if not user_id:
        return jsonify({
            "error": "Please login first"
        }), 401

    cur = get_cursor()

    cur.execute(
        """
        SELECT id
        FROM profiles
        WHERE user_id = %s
        """,
        (user_id,)
    )

    existing_profile = cur.fetchone()

    if existing_profile:

        cur.execute(
            """
            UPDATE profiles
            SET
                name = %s,
                education = %s,
                skills = %s,
                experience = %s
            WHERE user_id = %s
            """,
            (
                name,
                education,
                skills,
                experience,
                user_id
            )
        )

    else:

        cur.execute(
            """
            INSERT INTO profiles
            (
                user_id,
                name,
                education,
                skills,
                experience
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                user_id,
                name,
                education,
                skills,
                experience
            )
        )

    conn.commit()
    cur.close()

    return jsonify({
        "message": "Profile saved successfully!"
    }), 201


# =========================================================
# GET PROFILE
# =========================================================

@app.route("/api/profile", methods=["GET"])
def get_profile():

    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "error": "Please login first"
        }), 401

    cur = get_cursor()

    cur.execute(
        """
        SELECT
            id,
            name,
            education,
            skills,
            experience
        FROM profiles
        WHERE user_id = %s
        """,
        (user_id,)
    )

    profile = cur.fetchone()

    cur.close()

    if not profile:
        return jsonify({
            "profile": None
        })

    return jsonify({
        "profile": {
            "id": profile[0],
            "name": profile[1],
            "education": profile[2],
            "skills": profile[3],
            "experience": profile[4]
        }
    })


# =========================================================
# RECOMMENDED JOBS
# =========================================================

@app.route("/api/recommendations/<int:profile_id>", methods=["GET"])
def recommend_jobs(profile_id):

    resolved_profile_id = resolve_profile_id(profile_id)
    if not resolved_profile_id:
        return jsonify({
            "error": "Profile not found. Please complete and save your profile first."
        }), 404

    cur = get_cursor()

    cur.execute(
        """
        SELECT
            name,
            education,
            skills,
            experience
        FROM profiles
        WHERE id = %s
        """,
        (resolved_profile_id,)
    )

    profile = cur.fetchone()

    if not profile:
        cur.close()

        return jsonify({
            "error": "Profile not found"
        }), 404

    name, education, user_skills, experience = profile

    profile_text = " ".join([
        str(name or ""),
        str(education or ""),
        str(user_skills or ""),
        str(experience or "")
    ])

    cur.execute(
        """
        SELECT *
        FROM jobs
        """
    )

    rows = cur.fetchall()

    cur.close()

    if not rows:
        return jsonify([])

    jobs = [row_to_job(row) for row in rows]

    documents = [profile_text]

    for job in jobs:
        documents.append(
            " ".join([
                job["title"],
                job["skills"],
                job["description"]
            ])
        )

    try:

        vectorizer = TfidfVectorizer(
            stop_words="english"
        )

        tfidf_matrix = vectorizer.fit_transform(documents)

        similarity_scores = cosine_similarity(
            tfidf_matrix[0:1],
            tfidf_matrix[1:]
        ).flatten()

    except Exception:

        similarity_scores = [0] * len(jobs)

    for i, job in enumerate(jobs):

        tfidf_score = float(similarity_scores[i]) * 100

        skill_score, matched, missing = calculate_skill_match(
            user_skills,
            job["skills"]
        )

        final_score = round(
            (tfidf_score * 0.45) +
            (skill_score * 0.55),
            2
        )

        job["match_score"] = final_score
        job["matched_skills"] = matched
        job["missing_skills"] = missing

        if final_score >= 80:
            job["match_level"] = "Excellent match"
        elif final_score >= 60:
            job["match_level"] = "Strong match"
        elif final_score >= 40:
            job["match_level"] = "Potential match"
        else:
            job["match_level"] = "Skills to develop"

    jobs.sort(
        key=lambda x: x["match_score"],
        reverse=True
    )

    return jsonify(jobs)


# =========================================================
# SKILL GAP ANALYSIS
# =========================================================

@app.route(
    "/api/skill-recommendations/<int:profile_id>/<path:selected_job>",
    methods=["GET"]
)
def skill_recommendations(profile_id, selected_job):
    """Return a complete, frontend-friendly skill-gap analysis.

    The identifier may be either a logged-in user id or a profile id.
    The selected job may be a numeric job id or a job title.
    """
    resolved_profile_id = resolve_profile_id(profile_id)
    if not resolved_profile_id:
        return jsonify({
            "error": "Profile not found. Please complete and save your profile first."
        }), 404

    cur = get_cursor()

    cur.execute(
        """
        SELECT skills
        FROM profiles
        WHERE id = %s
        """,
        (resolved_profile_id,)
    )

    profile = cur.fetchone()
    if not profile:
        cur.close()
        return jsonify({"error": "Profile not found"}), 404

    user_skills = profile[0] or ""

    # First support the job id sent by the React application.
    job = None
    try:
        job_id = int(selected_job)
        cur.execute(
            """
            SELECT *
            FROM jobs
            WHERE id = %s
            LIMIT 1
            """,
            (job_id,)
        )
        job = cur.fetchone()
    except (TypeError, ValueError):
        pass

    # Backwards compatibility: support a job title as well.
    if not job:
        cur.execute(
            """
            SELECT *
            FROM jobs
            WHERE LOWER(title) = LOWER(%s)
            LIMIT 1
            """,
            (selected_job,)
        )
        job = cur.fetchone()

    if not job:
        cur.execute(
            """
            SELECT *
            FROM jobs
            WHERE LOWER(title) LIKE LOWER(%s)
            LIMIT 1
            """,
            (f"%{selected_job}%",)
        )
        job = cur.fetchone()

    cur.close()

    if not job:
        return jsonify({"error": "Selected job not found"}), 404

    job_data = row_to_job(job)

    score, matched, missing = calculate_skill_match(
        user_skills,
        job_data["skills"]
    )

    course_map = {
        "python": ("Python programming and problem solving", "Coursera", "Beginner", "4–6 weeks"),
        "java": ("Java programming and object-oriented design", "Coursera", "Beginner", "4–6 weeks"),
        "javascript": ("Modern JavaScript development", "freeCodeCamp", "Intermediate", "3–5 weeks"),
        "react": ("React.js and frontend application development", "freeCodeCamp", "Intermediate", "3–5 weeks"),
        "node.js": ("Node.js and REST API development", "freeCodeCamp", "Intermediate", "3–5 weeks"),
        "node": ("Node.js and REST API development", "freeCodeCamp", "Intermediate", "3–5 weeks"),
        "sql": ("SQL and relational database design", "Coursera", "Beginner", "3–4 weeks"),
        "postgresql": ("PostgreSQL database development", "PostgreSQL", "Intermediate", "2–4 weeks"),
        "mongodb": ("MongoDB and NoSQL databases", "MongoDB University", "Beginner", "2–4 weeks"),
        "machine learning": ("Machine Learning fundamentals", "Coursera", "Intermediate", "6–8 weeks"),
        "deep learning": ("Deep Learning fundamentals", "Coursera", "Advanced", "6–8 weeks"),
        "artificial intelligence": ("Artificial Intelligence fundamentals", "Coursera", "Intermediate", "5–7 weeks"),
        "data analysis": ("Data Analysis with Python", "freeCodeCamp", "Intermediate", "4–6 weeks"),
        "data analytics": ("Data Analytics and visualization", "Coursera", "Intermediate", "4–6 weeks"),
        "data science": ("Data Science foundations", "Coursera", "Intermediate", "6–8 weeks"),
        "tableau": ("Tableau data visualization", "Tableau", "Beginner", "2–4 weeks"),
        "power bi": ("Power BI and business intelligence", "Microsoft Learn", "Beginner", "3–4 weeks"),
        "excel": ("Advanced Excel for data analysis", "Microsoft Learn", "Intermediate", "2–3 weeks"),
        "pandas": ("Pandas for data manipulation", "Kaggle", "Intermediate", "2–3 weeks"),
        "numpy": ("NumPy for numerical computing", "NumPy", "Intermediate", "1–2 weeks"),
        "scikit-learn": ("Scikit-learn machine learning workflows", "Scikit-learn", "Intermediate", "3–4 weeks"),
        "git": ("Git and collaborative version control", "Atlassian", "Beginner", "1–2 weeks"),
        "github": ("GitHub and collaborative development", "GitHub Skills", "Beginner", "1–2 weeks"),
        "docker": ("Docker and containerization", "Docker", "Intermediate", "2–4 weeks"),
        "aws": ("AWS cloud fundamentals", "AWS Skill Builder", "Beginner", "3–5 weeks"),
        "azure": ("Microsoft Azure fundamentals", "Microsoft Learn", "Beginner", "3–5 weeks"),
        "rest api": ("REST API design and integration", "Postman", "Intermediate", "2–3 weeks"),
        "data structures": ("Data Structures and Algorithms", "GeeksforGeeks", "Intermediate", "6–8 weeks"),
        "algorithms": ("Algorithms and problem solving", "Coursera", "Intermediate", "5–7 weeks"),
        "operating systems": ("Operating Systems fundamentals", "NPTEL", "Intermediate", "6–8 weeks"),
        "dbms": ("Database Management Systems", "NPTEL", "Intermediate", "5–7 weeks"),
        "flask": ("Flask backend development", "Pallets", "Intermediate", "2–4 weeks"),
        "django": ("Django web development", "Django", "Intermediate", "3–5 weeks"),
        "flutter": ("Flutter mobile application development", "Flutter", "Intermediate", "4–6 weeks"),
        "figma": ("UI/UX design with Figma", "Figma", "Beginner", "2–3 weeks"),
        "communication": ("Professional communication", "Coursera", "Beginner", "2–3 weeks"),
        "leadership": ("Leadership and team management", "Coursera", "Intermediate", "3–4 weeks"),
        "problem solving": ("Problem solving and analytical thinking", "Coursera", "Intermediate", "3–4 weeks")
    }

    recommended_courses = []
    for index, skill in enumerate(missing):
        title, platform, level, duration = course_map.get(
            skill,
            (f"Learn and practice {skill}", "Online learning", "Beginner", "2–4 weeks")
        )
        recommended_courses.append({
            "id": f"{job_data['id']}-{index}",
            "skill": skill,
            "course_name": title,
            "platform": platform,
            "level": level,
            "duration": duration,
            "course_url": "https://www.coursera.org/"
        })

    return jsonify({
        "job": job_data,
        "skill_match": score,
        "match_score": score,
        "matched_skills": matched,
        "missing_skills": missing,
        "user_skills": sorted(extract_skill_tokens(user_skills)),
        "required_skills": sorted(extract_skill_tokens(job_data["skills"])),
        "recommended_courses": recommended_courses,
        "learning_recommendations": [
            {
                "skill": item["skill"],
                "recommendation": item["course_name"],
                "priority": "High" if index < 3 else "Medium"
            }
            for index, item in enumerate(recommended_courses)
        ],
        "summary": (
            f"You currently match {len(matched)} of "
            f"{len(extract_skill_tokens(job_data['skills']))} "
            f"identified job skills for {job_data['title']}."
        )
    })


# =========================================================
# APPLICATION HISTORY
# =========================================================

@app.route("/api/applications", methods=["GET"])
def get_applications():

    user = get_current_user()

    if not user:
        return jsonify({
            "error": "Please login first"
        }), 401

    email = user[2]

    cur = get_cursor()

    cur.execute(
        """
        SELECT
            a.job_id,
            a.name,
            a.email,
            a.resume_url,
            j.title,
            j.company,
            j.location
        FROM applications a
        LEFT JOIN jobs j
            ON a.job_id = j.id
        WHERE LOWER(a.email) = LOWER(%s)
        ORDER BY a.job_id DESC
        """,
        (email,)
    )

    rows = cur.fetchall()

    cur.close()

    applications = []

    for row in rows:

        applications.append({
            "job_id": row[0],
            "name": row[1],
            "email": row[2],
            "resume_url": row[3],
            "job_title": row[4],
            "company": row[5],
            "location": row[6],
            "status": "Application submitted"
        })

    return jsonify(applications)


# =========================================================
# PROFILE ANALYTICS
# =========================================================

@app.route("/api/profile-analysis/<int:profile_id>", methods=["GET"])
def profile_analysis(profile_id):

    cur = get_cursor()

    cur.execute(
        """
        SELECT
            name,
            education,
            skills,
            experience
        FROM profiles
        WHERE id = %s
        """,
        (profile_id,)
    )

    profile = cur.fetchone()

    if not profile:
        cur.close()

        return jsonify({
            "error": "Profile not found"
        }), 404

    name, education, skills, experience = profile

    cur.execute(
        """
        SELECT *
        FROM jobs
        """
    )

    rows = cur.fetchall()

    cur.close()

    jobs = [row_to_job(row) for row in rows]

    user_skill_set = extract_skill_tokens(skills)

    job_matches = []

    for job in jobs:

        score, matched, missing = calculate_skill_match(
            skills,
            job["skills"]
        )

        job_matches.append({
            "job": job,
            "score": score,
            "matched": matched,
            "missing": missing
        })

    job_matches.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    strongest = job_matches[:3]

    missing_frequency = {}

    for item in job_matches:

        for skill in item["missing"]:

            missing_frequency[skill] = (
                missing_frequency.get(skill, 0) + 1
            )

    top_gaps = sorted(
        missing_frequency.items(),
        key=lambda x: x[1],
        reverse=True
    )[:5]

    return jsonify({
        "profile": {
            "name": name,
            "education": education,
            "skills": skills,
            "experience": experience
        },
        "skill_count": len(user_skill_set),
        "top_job_matches": strongest,
        "priority_skills": [
            {
                "skill": skill,
                "job_count": count
            }
            for skill, count in top_gaps
        ]
    })


# =========================================================
# AI CAREER CHATBOT
# =========================================================

@app.route("/api/chatbot", methods=["POST"])
def chatbot():

    data = request.get_json() or {}

    message = data.get("message", "").strip()
    profile_id = data.get("profile_id")

    if not message:
        return jsonify({
            "reply": "Tell me what you want help with — jobs, skills, career direction, or your profile."
        }), 400

    profile = None

    if profile_id:
        resolved_profile_id = resolve_profile_id(profile_id)

        if resolved_profile_id:
            cur = get_cursor()

            cur.execute(
                """
                SELECT
                    name,
                    education,
                    skills,
                    experience
                FROM profiles
                WHERE id = %s
                """,
                (resolved_profile_id,)
            )

            profile = cur.fetchone()
            cur.close()

    user_skills = ""

    if profile:
        user_skills = profile[2] or ""

    detected_skills = extract_skill_tokens(user_skills)

    lower_message = message.lower()

    # -----------------------------------------------------
    # ROLE-SPECIFIC SKILL QUESTIONS
    # -----------------------------------------------------
    # If the user names a job, analyse that exact role first instead of
    # returning a generic list of skills across every job.
    role_job = None
    cur = get_cursor()
    cur.execute("SELECT * FROM jobs")
    all_job_rows = cur.fetchall()
    cur.close()

    for row in all_job_rows:
        candidate = row_to_job(row)
        title = str(candidate.get("title") or "").lower()
        if title and title in lower_message:
            role_job = candidate
            break

    if role_job and (
        "skill" in lower_message
        or "learn" in lower_message
        or "missing" in lower_message
        or "need" in lower_message
        or "suitable" in lower_message
    ):
        score, matched, missing = calculate_skill_match(
            user_skills,
            role_job["skills"]
        )

        if missing:
            missing_text = ", ".join(missing[:8])
            reply = (
                f"For {role_job['title']} at {role_job['company']}, your current skill match is {score:.0f}%. "
                f"You already cover {len(matched)} required skill(s). "
                f"Prioritise these next: {missing_text}."
            )
        else:
            reply = (
                f"You are strongly aligned with {role_job['title']} at {role_job['company']}. "
                f"Your profile covers the identified required skills."
            )

        return jsonify({
            "reply": reply,
            "type": "role_skill_recommendation",
            "job": {
                "id": role_job["id"],
                "title": role_job["title"],
                "company": role_job["company"]
            },
            "skill_match": score,
            "matched_skills": matched,
            "missing_skills": missing
        })


    # -----------------------------------------------------
    # SKILL QUESTIONS
    # -----------------------------------------------------

    if (
        "skill" in lower_message
        or "learn" in lower_message
        or "improve" in lower_message
        or "missing" in lower_message
    ):

        cur = get_cursor()

        cur.execute(
            """
            SELECT *
            FROM jobs
            """
        )

        rows = cur.fetchall()

        cur.close()

        missing_frequency = {}

        for row in rows:

            job = row_to_job(row)

            _, _, missing = calculate_skill_match(
                user_skills,
                job["skills"]
            )

            for skill in missing:

                missing_frequency[skill] = (
                    missing_frequency.get(skill, 0) + 1
                )

        priority_skills = sorted(
            missing_frequency.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        if priority_skills:

            skills_text = ", ".join(
                skill for skill, _ in priority_skills
            )

            return jsonify({
                "reply": (
                    "Based on your current profile, the skills "
                    f"worth prioritising are: {skills_text}. "
                    "These appear across the jobs in the current "
                    "TransConnect database."
                ),
                "type": "skill_recommendation",
                "skills": [
                    skill for skill, _ in priority_skills
                ]
            })

        return jsonify({
            "reply": (
                "Your current profile already covers the skills "
                "I can identify from the available job data. "
                "Adding more project experience would strengthen "
                "your profile further."
            ),
            "type": "skill_recommendation",
            "skills": []
        })


    # -----------------------------------------------------
    # JOB QUESTIONS
    # -----------------------------------------------------

    if (
        "job" in lower_message
        or "jobs" in lower_message
        or "work" in lower_message
        or "position" in lower_message
        or "role" in lower_message
    ):

        cur = get_cursor()

        cur.execute(
            """
            SELECT *
            FROM jobs
            """
        )

        rows = cur.fetchall()

        cur.close()

        jobs = [row_to_job(row) for row in rows]

        scored = []

        for job in jobs:

            score, matched, missing = calculate_skill_match(
                user_skills,
                job["skills"]
            )

            scored.append({
                "job": job,
                "score": score,
                "matched": matched,
                "missing": missing
            })

        scored.sort(
            key=lambda x: x["score"],
            reverse=True
        )

        best = scored[:3]

        if best:

            job_text = "; ".join(
                [
                    f"{item['job']['title']} at "
                    f"{item['job']['company']} "
                    f"({item['score']}% skill match)"
                    for item in best
                ]
            )

            return jsonify({
                "reply": (
                    "Based on your current profile, these are "
                    f"your strongest matches: {job_text}."
                ),
                "type": "job_recommendation",
                "jobs": [
                    {
                        "id": item["job"]["id"],
                        "title": item["job"]["title"],
                        "company": item["job"]["company"],
                        "match_score": item["score"]
                    }
                    for item in best
                ]
            })


    # -----------------------------------------------------
    # PROFILE QUESTIONS
    # -----------------------------------------------------

    if (
        "profile" in lower_message
        or "resume" in lower_message
        or "cv" in lower_message
    ):

        if profile:

            skill_count = len(detected_skills)

            return jsonify({
                "reply": (
                    f"Your profile currently contains about "
                    f"{skill_count} recognised professional skills. "
                    "To strengthen it, focus on measurable project "
                    "experience, relevant technologies, and skills "
                    "that repeatedly appear in your target jobs."
                ),
                "type": "profile_advice"
            })

        return jsonify({
            "reply": (
                "Create your profile first. Once your education, "
                "skills and experience are available, I can analyse "
                "your profile against the jobs in TransConnect."
            ),
            "type": "profile_advice"
        })


    # -----------------------------------------------------
    # CAREER QUESTIONS
    # -----------------------------------------------------

    if (
        "career" in lower_message
        or "future" in lower_message
        or "suitable" in lower_message
        or "best for me" in lower_message
    ):

        if profile:

            cur = get_cursor()

            cur.execute(
                """
                SELECT *
                FROM jobs
                """
            )

            rows = cur.fetchall()

            cur.close()

            jobs = [row_to_job(row) for row in rows]

            scored = []

            for job in jobs:

                score, matched, missing = calculate_skill_match(
                    user_skills,
                    job["skills"]
                )

                scored.append(
                    (
                        score,
                        job["title"],
                        job["company"]
                    )
                )

            scored.sort(
                reverse=True
            )

            if scored:

                best = scored[:3]

                recommendations = ", ".join(
                    f"{title} at {company}"
                    for _, title, company in best
                )

                return jsonify({
                    "reply": (
                        "From the current job data, your strongest "
                        f"career directions appear to be: "
                        f"{recommendations}. Build projects around "
                        "the missing skills for these roles to improve "
                        "your competitiveness."
                    ),
                    "type": "career_advice"
                })


    # -----------------------------------------------------
    # GENERAL RESPONSE
    # -----------------------------------------------------

    return jsonify({
        "reply": (
            "I can analyse your TransConnect profile and help with "
            "job matching, skill gaps, learning priorities, career "
            "direction, and resume/profile improvement. Try asking "
            "me something like 'Which jobs suit me?' or "
            "'What skills should I learn next?'"
        ),
        "type": "general"
    })


# =========================================================
# HEALTH CHECK
# =========================================================

@app.route("/api/health", methods=["GET"])
def health():

    try:

        cur = get_cursor()

        cur.execute("SELECT 1")

        cur.fetchone()

        cur.close()

        return jsonify({
            "status": "healthy",
            "database": "connected"
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "database": "disconnected",
            "message": str(error)
        }), 500


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        port=5000
    )