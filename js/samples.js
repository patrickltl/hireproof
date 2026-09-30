/* =========================================================
   HireProof — samples.js
   Realistic sample resume + job description used by the
   "Try with example" button.
   ========================================================= */
(function () {
  "use strict";

  var SAMPLE_RESUME = [
    "Jordan Avery",
    "jordan.avery@email.com | (555) 214-8890 | Portland, OR | linkedin.com/in/jordanavery",
    "",
    "Summary",
    "Frontend developer with 6 years of experience building responsive web applications with React and modern JavaScript. Comfortable across the full range of UI work: component architecture, unit testing, and cross-team collaboration. Clear written communication with designers, product managers, and engineers.",
    "",
    "Skills",
    "JavaScript (ES6+), React, Redux, HTML5, CSS3, Sass, Jest, Git, GitHub, RESTful APIs, Webpack, Agile ceremonies, unit testing, responsive design, design systems (Storybook), cross-browser debugging",
    "",
    "Experience",
    "",
    "Frontend Developer — Brightlane Software, Portland, OR",
    "Jun 2021 – Present",
    "• Built and shipped 20+ customer-facing features in React, reducing support tickets by 18%",
    "• Improved initial page load performance by 35% through code splitting and asset optimization",
    "• Wrote unit tests with Jest, raising component coverage from 40% to 85%",
    "• Responsible for mentoring two junior developers through weekly pairing sessions",
    "",
    "Web Developer — Cobalt Interactive, Portland, OR",
    "Aug 2019 – Jun 2021",
    "• Delivered responsive marketing sites and web apps for 15 clients using JavaScript, HTML5, and CSS3",
    "• Collaborated with designers and backend developers to integrate REST APIs",
    "• Maintained Git workflows and led biweekly code reviews for a team of five",
    "",
    "Junior Web Developer — Fern and Co, Remote",
    "Jul 2018 – Aug 2019",
    "- Built accessible, mobile-first layouts and fixed cross-browser issues across three client projects",
    "",
    "Education",
    "B.S. Computer Science — University of Oregon, 2018"
  ].join("\n");

  var SAMPLE_JD = [
    "Job Title: Senior Frontend Engineer",
    "",
    "Location: Remote (US/EU) — Full-time",
    "",
    "About the role",
    "We are a Series B fintech building the budgeting app used by 400,000 people. Our web team owns the customer dashboard, the onboarding flow, and internal admin tools. We are looking for a senior frontend engineer who cares about performance, accessibility, and clean architecture.",
    "",
    "What you'll do",
    "- Build and maintain customer-facing features in React and TypeScript",
    "- Own performance optimization across our web app, from bundle size to runtime profiling",
    "- Pair with product designers to ship accessible, responsive interfaces",
    "- Improve our CI/CD pipeline, testing culture, and developer tooling",
    "- Mentor mid-level engineers and lead code reviews",
    "",
    "Requirements",
    "- 5+ years of professional frontend experience with modern JavaScript",
    "- Strong React skills and real production experience with TypeScript",
    "- Experience with testing tools such as Jest and React Testing Library",
    "- Comfortable working with REST APIs and Git-based workflows",
    "- Solid understanding of web accessibility (WCAG 2.1) and semantic HTML",
    "- Experience with CI/CD pipelines and Agile development practices",
    "- Clear written communication and a collaborative, mentoring mindset",
    "",
    "Nice to have",
    "- Experience with GraphQL or Next.js",
    "- Contributions to design systems or component libraries",
    "- Familiarity with data visualization libraries",
    "- Experience in fintech or another regulated industry",
    "",
    "Benefits",
    "- Competitive salary and equity",
    "- Fully remote, flexible hours",
    "- Annual learning budget"
  ].join("\n");

  window.HireProofSamples = {
    resume: SAMPLE_RESUME,
    jd: SAMPLE_JD
  };
})();
