// Predefined stakeholder roles for sales room targeting
export const PREDEFINED_STAKEHOLDERS = [
  { key: 'ceo', label: 'CEO' },
  { key: 'cfo', label: 'CFO' },
  { key: 'cto', label: 'CTO' },
  { key: 'coo', label: 'COO' },
  { key: 'vp_sales', label: 'VP Sales' },
  { key: 'vp_engineering', label: 'VP Engineering' },
  { key: 'security_officer', label: 'Security Officer' },
  { key: 'engineering_lead', label: 'Engineering Lead' },
  { key: 'hr_director', label: 'HR Director' },
  { key: 'board_member', label: 'Board Member' },
];

export interface StakeholderSection {
  key: string;
  label: string;
  title: string;
  content: string;
}

// Default stakeholder content based on template type
export const getDefaultSectionContent = (
  sectionKey: string,
  templateType: string
): { title: string; content: string } => {
  const defaultContent: Record<string, Record<string, { title: string; content: string }>> = {
    cfo: {
      legacy_modernization: {
        title: 'ROI Analysis - Legacy Modernization',
        content: `**Investment Overview**\n\nOur legacy modernization approach delivers measurable financial returns:\n\n• **Cost Reduction**: Reduce maintenance costs by 40-60%\n• **Operational Efficiency**: Decrease manual processes by 70%\n• **Risk Mitigation**: Eliminate costly outages and security vulnerabilities\n\n**Financial Projections**\n\n- Year 1: Investment phase with 20% efficiency gains\n- Year 2: Break-even point with 35% cost savings\n- Year 3+: 150-200% ROI through ongoing operational savings`
      },
      cloud_migration: {
        title: 'ROI Analysis - Cloud Migration',
        content: `**Financial Benefits of Cloud Migration**\n\n• **CapEx to OpEx Shift**: Convert upfront investments into predictable monthly costs\n• **Infrastructure Savings**: Reduce hardware costs by 30-50%\n• **Scalability**: Pay only for what you use\n\n**Key Metrics**\n\n- Average 23% reduction in total IT spending\n- 57% faster time-to-market\n- 99.99% uptime SLA`
      },
      staff_augmentation: {
        title: 'ROI Analysis - Staff Augmentation',
        content: `**Cost-Effective Talent Acquisition**\n\n• **No Recruitment Costs**: Eliminate hiring fees\n• **Flexible Engagement**: Scale team based on project needs\n• **Reduced Overhead**: No benefits, training, or equipment costs\n\n**Comparison**\n\n- 35% lower total cost for 12-month projects\n- Zero ramp-up time\n- No severance costs`
      },
      custom: {
        title: 'ROI Analysis',
        content: `**Financial Overview**\n\nOur solution delivers measurable business value:\n\n• **Cost Savings**: Reduce operational costs\n• **Revenue Growth**: Enable new revenue streams\n• **Risk Reduction**: Minimize costly downtime\n\n**Expected Returns**\n\n- Positive ROI within 12-18 months\n- Ongoing annual savings of 25-40%`
      }
    },
    cto: {
      legacy_modernization: {
        title: 'Technical Specifications - Legacy Modernization',
        content: `**Architecture Approach**\n\n• **Strangler Fig Pattern**: Gradually replace legacy components\n• **API-First Design**: Clean interfaces between systems\n• **Microservices Architecture**: Independent scaling and deployment\n\n**Technology Stack**\n\n- Backend: Node.js / Python / Go with Docker/Kubernetes\n- Frontend: React / Vue.js\n- Database: PostgreSQL with Redis caching\n- CI/CD: GitHub Actions with automated testing`
      },
      cloud_migration: {
        title: 'Technical Specifications - Cloud Architecture',
        content: `**Cloud Architecture Design**\n\n• **Multi-Region Deployment**: Geographic redundancy\n• **Auto-Scaling**: Dynamic resource allocation\n• **Infrastructure as Code**: Reproducible environments\n\n**Recommended Services**\n\n- Compute: Kubernetes (EKS/GKE/AKS)\n- Storage: Object storage + managed databases\n- Networking: VPC with load balancing\n- Monitoring: Prometheus + Grafana`
      },
      staff_augmentation: {
        title: 'Technical Expertise',
        content: `**Available Technical Skills**\n\n**Backend**: Node.js, Python, Java, Go, .NET\n**Frontend**: React, Vue.js, Angular, TypeScript\n**DevOps**: Kubernetes, Docker, Terraform, AWS/Azure/GCP\n**Data**: SQL/NoSQL, ETL, Analytics\n**QA**: Automated testing, Performance testing, Security testing`
      },
      custom: {
        title: 'Technical Specifications',
        content: `**Technical Approach**\n\n• **Modern Architecture**: Scalable, maintainable, secure\n• **Best Practices**: Industry-standard methodologies\n• **Integration Ready**: APIs for your existing systems\n\n**Key Features**\n\n- High availability (99.9%+ uptime)\n- Comprehensive API documentation\n- Security-first design`
      }
    },
    security_officer: {
      legacy_modernization: {
        title: 'Security & Compliance - Legacy Modernization',
        content: `**Security Improvements**\n\n• **Vulnerability Remediation**: Eliminate known CVEs\n• **Modern Authentication**: OAuth 2.0, SAML, MFA\n• **Encryption**: TLS 1.3, AES-256 at rest\n\n**Compliance Frameworks**\n\n- SOC 2 Type II\n- ISO 27001\n- GDPR / CCPA`
      },
      custom: {
        title: 'Security & Compliance',
        content: `**Security Commitment**\n\n• **Data Protection**: Industry-standard encryption and access controls\n• **Compliance**: Support for major regulatory frameworks\n• **Transparency**: Regular security assessments\n\n**Certifications**\n\n- SOC 2 Type II compliant\n- GDPR compliant`
      }
    },
    engineering_lead: {
      legacy_modernization: {
        title: 'Developer Experience - Legacy Modernization',
        content: `**Improved Developer Productivity**\n\n• **Modern Tooling**: Replace outdated IDEs and build systems\n• **Fast Feedback Loops**: Hot reload, quick tests\n• **Clear Documentation**: Auto-generated API docs\n\n**CI/CD Pipeline**\n\n- Automated testing (unit, integration, e2e)\n- Code quality gates\n- Feature flags for safe releases`
      },
      custom: {
        title: 'Developer Experience',
        content: `**Development Best Practices**\n\n• **Clean Code**: Readable, maintainable, well-documented\n• **Modern Stack**: Up-to-date technologies\n• **Automation**: CI/CD pipelines and IaC\n\n**Benefits**\n\n- Faster onboarding\n- Reduced time-to-market\n- Lower maintenance overhead`
      }
    }
  };

  const sectionContent = defaultContent[sectionKey]?.[templateType] || defaultContent[sectionKey]?.custom;
  return sectionContent || { title: `For ${sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`, content: 'Content for this section is being prepared.' };
};
