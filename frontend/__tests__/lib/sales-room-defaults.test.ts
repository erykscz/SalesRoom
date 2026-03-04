import { PREDEFINED_STAKEHOLDERS, getDefaultSectionContent } from '@/lib/sales-room-defaults';

describe('PREDEFINED_STAKEHOLDERS', () => {
  it('should be an array of stakeholder objects', () => {
    expect(Array.isArray(PREDEFINED_STAKEHOLDERS)).toBe(true);
    expect(PREDEFINED_STAKEHOLDERS.length).toBeGreaterThan(0);
  });

  it('each stakeholder should have key and label properties', () => {
    PREDEFINED_STAKEHOLDERS.forEach((stakeholder) => {
      expect(stakeholder).toHaveProperty('key');
      expect(stakeholder).toHaveProperty('label');
      expect(typeof stakeholder.key).toBe('string');
      expect(typeof stakeholder.label).toBe('string');
    });
  });

  it('should include expected stakeholders', () => {
    const keys = PREDEFINED_STAKEHOLDERS.map((s) => s.key);
    expect(keys).toContain('ceo');
    expect(keys).toContain('cfo');
    expect(keys).toContain('cto');
    expect(keys).toContain('coo');
    expect(keys).toContain('vp_sales');
  });

  it('should have 10 predefined stakeholders', () => {
    expect(PREDEFINED_STAKEHOLDERS.length).toBe(10);
  });
});

describe('getDefaultSectionContent', () => {
  it('should return title and content for CFO + legacy_modernization', () => {
    const result = getDefaultSectionContent('cfo', 'legacy_modernization');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('content');
    expect(result.title).toBe('ROI Analysis - Legacy Modernization');
    expect(result.content).toContain('Cost Reduction');
  });

  it('should return title and content for CTO + cloud_migration', () => {
    const result = getDefaultSectionContent('cto', 'cloud_migration');
    expect(result.title).toBe('Technical Specifications - Cloud Architecture');
    expect(result.content).toContain('Cloud Architecture Design');
  });

  it('should return title and content for CFO + staff_augmentation', () => {
    const result = getDefaultSectionContent('cfo', 'staff_augmentation');
    expect(result.title).toBe('ROI Analysis - Staff Augmentation');
    expect(result.content).toContain('No Recruitment Costs');
  });

  it('should fall back to custom template when specific template not found', () => {
    const result = getDefaultSectionContent('cfo', 'nonexistent_template');
    expect(result.title).toBe('ROI Analysis');
    expect(result.content).toContain('Financial Overview');
  });

  it('should fall back to custom for security_officer with unknown template', () => {
    const result = getDefaultSectionContent('security_officer', 'staff_augmentation');
    expect(result.title).toBe('Security & Compliance');
    expect(result.content).toContain('Security Commitment');
  });

  it('should return generic content for unknown section key', () => {
    const result = getDefaultSectionContent('unknown_role', 'legacy_modernization');
    expect(result.title).toContain('Unknown Role');
    expect(result.content).toBe('Content for this section is being prepared.');
  });

  it('should properly capitalize multi-word section keys in fallback', () => {
    const result = getDefaultSectionContent('vp_sales', 'any_template');
    expect(result.title).toContain('Vp Sales');
  });

  it('should handle engineering_lead + legacy_modernization', () => {
    const result = getDefaultSectionContent('engineering_lead', 'legacy_modernization');
    expect(result.title).toBe('Developer Experience - Legacy Modernization');
    expect(result.content).toContain('Improved Developer Productivity');
  });

  it('should handle engineering_lead + custom fallback', () => {
    const result = getDefaultSectionContent('engineering_lead', 'unknown');
    expect(result.title).toBe('Developer Experience');
    expect(result.content).toContain('Development Best Practices');
  });

  it('should handle security_officer + legacy_modernization', () => {
    const result = getDefaultSectionContent('security_officer', 'legacy_modernization');
    expect(result.title).toBe('Security & Compliance - Legacy Modernization');
    expect(result.content).toContain('Vulnerability Remediation');
  });
});
