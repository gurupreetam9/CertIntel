import {
  BrainCircuit,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  FileText,
  BookOpen,
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
  icon: React.ElementType;
  featured?: boolean;
  content: ReactNode;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'how-ai-ocr-transforms-certificate-management',
    title: 'How AI-Powered OCR Is Transforming Certificate Management',
    excerpt:
      'Traditional certificate management is manual and error-prone. Discover how YOLOv8-based OCR extracts structured data from certificates in seconds, enabling intelligent organization and analysis at scale.',
    date: '2026-05-10',
    readTime: '6 min read',
    category: 'AI & Technology',
    icon: BrainCircuit,
    featured: true,
    content: (
      <>
        <p>
          For students and educators, managing certificates has traditionally been a tedious, manual process. Certificates arrive as images, PDFs, or even paper documents — each in a different format, with no standardized way to extract the course name, issuing body, or date. CertIntel set out to change that with AI-powered Optical Character Recognition (OCR).
        </p>

        <h2>The Problem with Manual Certificate Management</h2>
        <p>
          Consider a student who has completed 30+ online courses across platforms like Coursera, Udemy, and Google Skillshop. Each platform issues certificates in different formats — some as downloadable PDFs, others as images, and a few only accessible via a verification URL. Keeping track of what you&apos;ve earned, what skills they map to, and what to learn next becomes overwhelming.
        </p>
        <p>
          Educators face an even bigger challenge. An admin managing 50 students needs to verify certificate submissions, track which students have completed required courses, and identify gaps — all manually.
        </p>

        <h2>How CertIntel Uses YOLOv8 for Certificate OCR</h2>
        <p>
          CertIntel&apos;s AI pipeline is built on YOLOv8, a state-of-the-art object detection model originally designed for real-time visual recognition tasks. We&apos;ve adapted it specifically for certificate document analysis:
        </p>
        <ul>
          <li><strong>Region Detection:</strong> YOLOv8 identifies key regions in a certificate — the course title, issuing organization, student name, and date fields — even when layouts vary wildly between platforms.</li>
          <li><strong>Text Extraction:</strong> Once regions are identified, OCR engines (including Tesseract.js) extract the text from each detected region with high confidence.</li>
          <li><strong>Course Name Mapping:</strong> The extracted text is processed through NLP pipelines to normalize course names. For example, &quot;Google Digital Marketing &amp; E-commerce Professional Certificate&quot; and &quot;Google Digital Marketing Certificate&quot; are recognized as the same credential.</li>
        </ul>

        <h2>Multi-Format Support</h2>
        <p>
          Real-world certificates come in many formats. CertIntel handles this by supporting both image uploads (JPEG, PNG, WebP) and PDF documents. When a PDF is uploaded, the system automatically converts each page into an individual image for processing. This means a multi-page PDF containing several certificates is split and analyzed page by page — no manual intervention required.
        </p>

        <h2>From Raw Data to Actionable Insights</h2>
        <p>
          The real power of AI-powered OCR isn&apos;t just reading text — it&apos;s what you do with it. Once CertIntel extracts course names from your certificates, that data feeds into:
        </p>
        <ul>
          <li><strong>Automated Portfolio Organization:</strong> Certificates are grouped by course name automatically.</li>
          <li><strong>AI Course Recommendations:</strong> Your completed courses are analyzed to suggest logical next steps in your learning journey.</li>
          <li><strong>Admin Analytics:</strong> Educators see real-time dashboards showing which courses their students have completed, upload trends, and gap analysis.</li>
        </ul>

        <h2>The Future of Certificate Intelligence</h2>
        <p>
          As OCR models continue to improve and more training data becomes available, the accuracy and speed of certificate analysis will only increase. CertIntel is committed to staying at the forefront of this technology — turning static documents into dynamic, searchable, actionable data that powers smarter learning decisions.
        </p>
      </>
    ),
  },
  {
    slug: 'building-personalized-learning-paths-with-nlp',
    title: 'Building Personalized Learning Paths with NLP-Driven Recommendations',
    excerpt:
      'How CertIntel uses natural language processing to analyze your completed certifications and intelligently suggest the next courses in your professional development journey.',
    date: '2026-05-05',
    readTime: '5 min read',
    category: 'Product',
    icon: Sparkles,
    featured: true,
    content: (
      <>
        <p>
          Completing a course is an achievement, but knowing what to learn next is often the bigger challenge. CertIntel&apos;s recommendation engine uses Natural Language Processing to analyze your certificate portfolio and generate personalized course suggestions — bridging the gap between what you&apos;ve learned and what you should learn next.
        </p>

        <h2>Why Generic Course Lists Don&apos;t Work</h2>
        <p>
          Most learning platforms recommend courses based on popularity or broad categories. If you just completed &quot;Python for Data Science,&quot; you might see recommendations for &quot;Advanced Python&quot; — but also for &quot;Python for Web Development,&quot; which may be entirely irrelevant to your career path. Generic recommendations waste time and create decision fatigue.
        </p>

        <h2>CertIntel&apos;s Approach: Context-Aware Recommendations</h2>
        <p>
          CertIntel takes a fundamentally different approach. Instead of looking at individual courses in isolation, the system analyzes your entire certificate portfolio as a coherent learning trajectory:
        </p>
        <ul>
          <li><strong>Course Clustering:</strong> Related certifications are grouped together. If you have certificates in &quot;Machine Learning Fundamentals,&quot; &quot;Python for Data Science,&quot; and &quot;Statistics 101,&quot; the system recognizes a data science trajectory.</li>
          <li><strong>Gap Analysis:</strong> By mapping your completed courses against established learning paths, the system identifies skills you&apos;re missing. Completed ML basics but no deep learning? That&apos;s a gap worth filling.</li>
          <li><strong>LLM-Powered Suggestions:</strong> Using large language models, CertIntel generates specific, actionable course recommendations with descriptions and direct links to where you can enroll.</li>
        </ul>

        <h2>Manual Course Entry for Complete Coverage</h2>
        <p>
          Not all learning comes with a certificate. CertIntel allows you to manually add courses you&apos;ve completed — whether from workshops, bootcamps, or self-study. These manual entries are included in the recommendation analysis, ensuring your suggestions reflect your true skill set.
        </p>

        <h2>How the AI Processing Pipeline Works</h2>
        <p>
          When you request AI suggestions, CertIntel&apos;s Flask-based AI server (hosted on Hugging Face Spaces) processes your consolidated course list through several stages:
        </p>
        <ol>
          <li>Course names are normalized and deduplicated.</li>
          <li>Each course is mapped against a knowledge graph of learning topics.</li>
          <li>An LLM analyzes the full list and generates 3-5 next-step recommendations per course area.</li>
          <li>Results are cached to enable instant retrieval on subsequent visits.</li>
        </ol>

        <h2>The Result: A Personalized Learning Roadmap</h2>
        <p>
          Instead of scrolling through thousands of courses on various platforms, CertIntel gives you a focused, AI-curated set of recommendations based on what you&apos;ve actually accomplished. It&apos;s the difference between a search engine and a personal advisor — and it&apos;s available to every CertIntel user for free.
        </p>
      </>
    ),
  },
  {
    slug: 'why-digital-certificate-portfolios-matter',
    title: 'Why Every Student Needs a Digital Certificate Portfolio in 2026',
    excerpt:
      'In a credential-driven job market, a well-organized digital certificate portfolio sets you apart. Learn why centralized certificate management is becoming essential for career growth.',
    date: '2026-04-28',
    readTime: '4 min read',
    category: 'Career',
    icon: GraduationCap,
    content: (
      <>
        <p>
          The job market in 2026 values skills over degrees more than ever before. Micro-credentials, professional certificates, and online course completions have become the currency of career advancement. But having certificates scattered across email inboxes, download folders, and platform dashboards undermines their value.
        </p>

        <h2>The Rise of Micro-Credentials</h2>
        <p>
          According to industry reports, the online learning market has grown exponentially, with platforms like Coursera, Google Career Certificates, and AWS Training issuing millions of credentials annually. Employers increasingly look for specific skills validated by these certificates rather than traditional four-year degrees.
        </p>
        <p>
          But here&apos;s the problem: if you can&apos;t quickly produce and organize your credentials, their value diminishes. A hiring manager asking &quot;Show me your cloud certifications&quot; doesn&apos;t want to wait while you search through three years of emails.
        </p>

        <h2>What a Digital Certificate Portfolio Should Include</h2>
        <ul>
          <li><strong>Centralized Storage:</strong> All certificates in one searchable location, regardless of the issuing platform.</li>
          <li><strong>Automatic Organization:</strong> Certificates grouped by course name, date, or skill area — not dumped in a single folder.</li>
          <li><strong>Easy Sharing:</strong> The ability to share specific certificates or your entire portfolio with employers or educators.</li>
          <li><strong>Skill Gap Visibility:</strong> Understanding what you have and what you need is crucial for strategic career planning.</li>
        </ul>

        <h2>How CertIntel Solves This</h2>
        <p>
          CertIntel was built specifically to address the certificate management problem. Upload your certificates as images or PDFs, and the AI automatically extracts course names and organizes them into a browsable portfolio. The admin-student linking feature allows educators to track student progress without manual spreadsheet management.
        </p>
        <p>
          Beyond storage, CertIntel adds intelligence — analyzing what you&apos;ve learned and recommending what to learn next. Your certificate portfolio becomes a living document that actively guides your professional development.
        </p>

        <h2>Start Building Your Portfolio Today</h2>
        <p>
          Whether you&apos;re a student building skills for your first job or a professional upskilling for a career transition, a well-organized digital certificate portfolio is no longer optional — it&apos;s essential. CertIntel makes it effortless to get started.
        </p>
      </>
    ),
  },
  {
    slug: 'securing-student-data-firebase-authentication',
    title: 'How CertIntel Secures Student Data with Firebase Authentication & 2FA',
    excerpt:
      'Security is non-negotiable when handling educational data. Explore CertIntel\'s multi-layered security architecture: Firebase Auth, two-factor verification, role-based access, and encrypted storage.',
    date: '2026-04-20',
    readTime: '7 min read',
    category: 'Security',
    icon: ShieldCheck,
    content: (
      <>
        <p>
          When students trust a platform with their educational credentials, security isn&apos;t a feature — it&apos;s a fundamental requirement. CertIntel takes a defense-in-depth approach to protecting user data, combining Firebase Authentication, optional two-factor authentication, role-based access control, and secure storage practices.
        </p>

        <h2>Authentication: More Than Just a Password</h2>
        <p>
          CertIntel uses Firebase Authentication as its identity layer, providing battle-tested security infrastructure maintained by Google. But we go beyond basic email/password login:
        </p>
        <ul>
          <li><strong>Email OTP Verification:</strong> During registration, users must verify their email address with a one-time password sent via our Genkit AI flow — ensuring only real email addresses are registered.</li>
          <li><strong>Two-Factor Authentication (2FA):</strong> Users can enable 2FA in their profile settings. When enabled, a verification code is sent to their email on every login attempt, adding a second layer of protection.</li>
          <li><strong>Login Notifications:</strong> Each successful login triggers an email notification, alerting users to any unauthorized access attempts.</li>
        </ul>

        <h2>Role-Based Access Control</h2>
        <p>
          CertIntel supports two distinct roles — Student and Admin (Teacher/Educator) — each with carefully scoped permissions:
        </p>
        <ul>
          <li><strong>Students</strong> can only view and manage their own certificates. They cannot access other students&apos; data or administrative functions.</li>
          <li><strong>Admins</strong> can view certificates of students who have explicitly linked to them via a request system. Admins cannot see unlinked students&apos; data.</li>
          <li><strong>Linking Workflow:</strong> Students must initiate a link request using an admin&apos;s unique shareable ID. The admin must then explicitly approve the request. This ensures no unauthorized data access.</li>
        </ul>

        <h2>Firestore Security Rules</h2>
        <p>
          Backend security in CertIntel is enforced at the database level with Firestore security rules. These rules ensure that even if an API endpoint were compromised, the database itself rejects unauthorized read/write operations. Key rules include owner-only access to profile data, admin-only access to link request management, and validation of all write operations.
        </p>

        <h2>Secure File Storage</h2>
        <p>
          Certificate files are stored in MongoDB GridFS with access controlled through authenticated API routes. Every file request is validated against the user&apos;s authentication token and ownership records. Files are never publicly accessible — they&apos;re served through authenticated endpoints that verify the requesting user has permission to view that specific file.
        </p>

        <h2>Account Deletion</h2>
        <p>
          CertIntel provides a complete account deletion flow. When a user requests deletion, a unique token is generated and sent via email. Only by clicking the tokenized link and confirming can the deletion proceed — at which point all user data, certificates, and linked records are permanently removed from both Firebase and MongoDB.
        </p>

        <h2>Our Commitment</h2>
        <p>
          Security is an ongoing process, not a one-time implementation. CertIntel&apos;s roadmap includes regular security audits, enhanced Firestore rules, and migration to production-grade email services. We believe students&apos; educational data deserves the same level of protection as financial data.
        </p>
      </>
    ),
  },
  {
    slug: 'admin-analytics-dashboard-deep-dive',
    title: 'Deep Dive: The Admin Analytics Dashboard for Educators',
    excerpt:
      'CertIntel\'s admin dashboard gives educators powerful insights — from certificate distribution charts to student-level tracking. See how data-driven analytics improve educational oversight.',
    date: '2026-04-15',
    readTime: '5 min read',
    category: 'Product',
    icon: FileText,
    content: (
      <>
        <p>
          Educators managing multiple students need more than a list of uploaded files — they need insights. CertIntel&apos;s Admin Analytics Dashboard transforms raw certificate data into interactive visualizations that reveal patterns, identify gaps, and enable data-driven educational decisions.
        </p>

        <h2>Dashboard Overview</h2>
        <p>
          When an admin logs in, they&apos;re greeted with a comprehensive analytics view built on real data from their linked students&apos; certificates. The dashboard is organized into collapsible sections for easy navigation.
        </p>

        <h2>Course Certificate Distribution (Pie Chart)</h2>
        <p>
          The top 10 most common courses across all linked students are visualized in an interactive pie chart. Clicking any slice reveals the exact count and full course name. This gives educators an instant view of which certifications are most popular among their students — useful for curriculum planning and understanding industry trends.
        </p>

        <h2>Upload Trends Over Time (Line Chart)</h2>
        <p>
          A time-series line chart tracks daily certificate upload activity. Spikes in uploads often correlate with course completion deadlines or exam periods. Admins can use this data to understand engagement patterns and identify periods of low activity that might require intervention.
        </p>

        <h2>Powerful Search with Real-Time Analytics</h2>
        <p>
          The course search feature is more than a filter — it&apos;s an analytics tool. When an admin searches for a specific course name:
        </p>
        <ul>
          <li>A <strong>gauge chart</strong> instantly shows what percentage of linked students have that certificate.</li>
          <li>A <strong>sortable results table</strong> lists every matching certificate with student name, roll number, email, and the option to view the actual certificate image.</li>
          <li><strong>Bulk download</strong> lets admins export all matching certificates as a ZIP file — perfect for compliance reporting or portfolio reviews.</li>
          <li><strong>Email notification</strong> enables admins to notify students who are missing a specific certificate with a single click.</li>
        </ul>

        <h2>Student-Level Sorting and Tracking</h2>
        <p>
          Search results can be sorted by student name or roll number (with numeric-aware sorting), making it easy to cross-reference with institutional records. The view button on each row opens the actual certificate image in a modal, allowing quick visual verification without leaving the dashboard.
        </p>

        <h2>Built for Real Classroom Needs</h2>
        <p>
          Every feature in the admin dashboard was designed for real educational workflows: tracking course completion across a cohort, identifying students who need to submit specific certificates, and generating exportable reports. It&apos;s not just a data viewer — it&apos;s a classroom management tool powered by AI-extracted certificate data.
        </p>
      </>
    ),
  },
  {
    slug: 'from-pdf-to-insight-certintel-processing-pipeline',
    title: 'From PDF to Insight: Inside CertIntel\'s Certificate Processing Pipeline',
    excerpt:
      'A technical walkthrough of how CertIntel converts uploaded PDFs and images into structured, searchable certificate data using a combination of computer vision and cloud infrastructure.',
    date: '2026-04-08',
    readTime: '8 min read',
    category: 'Engineering',
    icon: BookOpen,
    content: (
      <>
        <p>
          Behind CertIntel&apos;s simple upload-and-analyze interface lies a sophisticated processing pipeline that spans multiple services, languages, and cloud platforms. This article walks through the complete journey of a certificate — from the moment a user uploads a PDF to the point where AI-generated course recommendations appear on screen.
        </p>

        <h2>Step 1: File Upload and Storage</h2>
        <p>
          When a user uploads a certificate through the Next.js frontend, the file is sent to an API route that handles both images and PDFs. The file is stored in MongoDB GridFS — a specification for storing large files in MongoDB that chunks files into manageable pieces and stores them alongside metadata like the original filename, content type, upload date, and the owning user&apos;s ID.
        </p>

        <h2>Step 2: PDF Page Extraction</h2>
        <p>
          If the uploaded file is a PDF, the system doesn&apos;t just store it as-is. A server-side process converts each page of the PDF into individual images. This is critical because a single PDF might contain multiple certificates (one per page), and each needs to be analyzed independently. The converted images are stored as separate entries in GridFS, maintaining a reference to the original PDF.
        </p>

        <h2>Step 3: OCR and Course Name Extraction</h2>
        <p>
          The extracted images are sent to CertIntel&apos;s Flask-based AI server, hosted on Hugging Face Spaces. This server runs the YOLOv8 model to detect text regions within the certificate image, then applies OCR to extract readable text. The most important output is the identified course name, which is normalized and stored back as metadata on the certificate record.
        </p>

        <h2>Step 4: Knowledge Graph Mapping</h2>
        <p>
          Extracted course names aren&apos;t used in isolation. The Flask server maintains a knowledge graph of courses and their relationships — understanding that &quot;Introduction to Machine Learning&quot; is related to &quot;Deep Learning Specialization&quot; and both fall under the &quot;Artificial Intelligence&quot; domain. This graph powers the recommendation engine&apos;s ability to suggest logically connected next steps.
        </p>

        <h2>Step 5: LLM-Powered Recommendations</h2>
        <p>
          With the user&apos;s consolidated course list (from both OCR-extracted and manually entered courses), the system calls an LLM to generate personalized suggestions. The LLM receives context about the user&apos;s learning history and returns structured recommendations — each with a course name, description, and enrollment URL. These results are cached server-side using the user&apos;s ID as a key.
        </p>

        <h2>Step 6: Real-Time Frontend Updates</h2>
        <p>
          The Next.js frontend uses a polling mechanism to check for completed AI processing results. When generation is triggered, a flag is stored in localStorage so the user can navigate away and return later. The AI Insights page polls the Flask server every 5 seconds and automatically updates when results are ready — with a safety timeout after 2 minutes.
        </p>

        <h2>Infrastructure Overview</h2>
        <p>
          The full pipeline spans three deployment targets: the Next.js frontend on Vercel, Firebase services (Auth, Firestore, Storage) for user management, and the Flask AI server on Hugging Face Spaces for compute-intensive OCR and LLM tasks. MongoDB Atlas handles file storage and certificate metadata. This separation of concerns allows each service to scale independently and keeps the AI processing costs isolated from the main application hosting.
        </p>

        <h2>What&apos;s Next</h2>
        <p>
          Future improvements to the pipeline include batch processing for bulk uploads, more sophisticated PDF parsing that handles multi-column layouts, and a move from polling to WebSocket-based real-time updates. The goal is to make the entire journey — from upload to insight — feel instantaneous.
        </p>
      </>
    ),
  },
];
