'use client';
import { useState } from 'react';

interface MarketplaceTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  author: string;
  price_usd: number;
  download_count: number;
  rating: number;
  preview_agents: string[];
}

const SEED_TEMPLATES: MarketplaceTemplate[] = [
  {
    id: 'tpl-saas',
    title: 'SaaS Startup',
    description: 'Full SaaS company with product development, quality assurance, and go-to-market agents. Perfect for shipping software products autonomously.',
    category: 'Technology',
    author: 'APEX Team',
    price_usd: 0,
    download_count: 0,
    rating: 5.0,
    preview_agents: ['CEO', 'Engineer', 'QA', 'Marketing', 'Eval Engineer'],
  },
  {
    id: 'tpl-content',
    title: 'Content Agency',
    description: 'Content production pipeline with writers, editors, SEO optimization, and multi-channel distribution. Publishes content on autopilot.',
    category: 'Marketing',
    author: 'APEX Team',
    price_usd: 0,
    download_count: 0,
    rating: 4.8,
    preview_agents: ['CEO', 'Writer', 'Editor', 'SEO Specialist', 'Distributor'],
  },
  {
    id: 'tpl-ecommerce',
    title: 'E-commerce',
    description: 'Online retail operations with product management, customer service, advertising, and analytics. Runs your store 24/7.',
    category: 'Retail',
    author: 'APEX Team',
    price_usd: 0,
    download_count: 0,
    rating: 4.9,
    preview_agents: ['CEO', 'Product Manager', 'Customer Service', 'Ads Manager', 'Analytics'],
  },
  {
    id: 'tpl-research',
    title: 'Research Firm',
    description: 'Research and analysis company with deep-dive researchers, data analysts, report writers, and quality review. Produces professional research autonomously.',
    category: 'Professional Services',
    author: 'APEX Team',
    price_usd: 0,
    download_count: 0,
    rating: 4.7,
    preview_agents: ['CEO', 'Researcher', 'Analyst', 'Writer', 'QA'],
  },
  {
    id: 'tpl-moving',
    title: 'Moving Company',
    description: 'Full moving company operations: dispatch, lead recovery, quoting, compliance (WA UTC 15-C), fleet coordination, and reviews. Battle-tested vertical.',
    category: 'Services',
    author: 'APEX Team',
    price_usd: 0,
    download_count: 0,
    rating: 5.0,
    preview_agents: ['CEO', 'Dispatch', 'Lead Recovery', 'Quote', 'Compliance', 'Fleet Coordinator'],
  },
];

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(SEED_TEMPLATES.map(t => t.category))];

  const filtered = SEED_TEMPLATES.filter(t => {
    const matchesSearch = !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ padding: '2rem', fontFamily: 'DM Sans, sans-serif', color: '#F5F5F5', minHeight: '100vh', background: '#0A0A0A' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#00FF88', marginBottom: '0.5rem' }}>
            ApexHub Marketplace
          </h1>
          <p style={{ color: '#6B6B6B', fontSize: '1rem' }}>
            Deploy a pre-built company in one click. Every template includes agents, routines, and skills.
          </p>
        </div>

        {/* Search and filters */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: '200px', padding: '0.75rem 1rem',
              background: '#111111', border: '1px solid #1F1F1F', borderRadius: '8px',
              color: '#F5F5F5', fontSize: '0.9rem', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedCategory(null)}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #1F1F1F',
                background: !selectedCategory ? '#00FF88' : '#111111',
                color: !selectedCategory ? '#0A0A0A' : '#6B6B6B',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}
            >All</button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #1F1F1F',
                  background: selectedCategory === cat ? '#00FF88' : '#111111',
                  color: selectedCategory === cat ? '#0A0A0A' : '#6B6B6B',
                  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                }}
              >{cat}</button>
            ))}
          </div>
        </div>

        {/* Template grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {filtered.map(template => (
            <div key={template.id} style={{
              background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px',
              padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              {/* Title row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'Space Mono, monospace' }}>
                  {template.title}
                </h2>
                <span style={{
                  fontFamily: 'Space Mono, monospace', fontSize: '0.85rem', fontWeight: 700,
                  color: template.price_usd === 0 ? '#00FF88' : '#F5F5F5',
                }}>
                  {template.price_usd === 0 ? 'FREE' : `$${template.price_usd}`}
                </span>
              </div>

              {/* Description */}
              <p style={{ color: '#6B6B6B', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {template.description}
              </p>

              {/* Agent pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {template.preview_agents.map(agent => (
                  <span key={agent} style={{
                    padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                    background: '#1F1F1F', color: '#F5F5F5', fontFamily: 'Space Mono, monospace',
                  }}>
                    {agent}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '1px solid #1F1F1F', paddingTop: '1rem', marginTop: 'auto',
              }}>
                <div style={{ display: 'flex', gap: '1rem', color: '#6B6B6B', fontSize: '0.8rem' }}>
                  <span>{template.author}</span>
                  <span>{template.rating.toFixed(1)} / 5.0</span>
                </div>
                <button style={{
                  padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
                  background: '#00FF88', color: '#0A0A0A', fontWeight: 700,
                  cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Space Mono, monospace',
                }}>
                  Deploy
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#6B6B6B' }}>
            <p>No templates match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
