import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/quickstart">
            Start with Quickstart
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description="Documentation for the Muonroi open-core ecosystem">
      <HomepageHeader />
      <main>
        <div className="container padding-vert--xl">
          <div className="row">
            <div className="col col--4">
              <h3>Rule Engine</h3>
              <p>Code-first rules, runtime rulesets, approval workflow, canary rollout, and Redis-backed hot reload.</p>
            </div>
            <div className="col col--4">
              <h3>Decision Tables</h3>
              <p>Postgres-backed decision tables with version history, audit trail, FEEL autocomplete, and export flows.</p>
            </div>
            <div className="col col--4">
              <h3>Open Core</h3>
              <p>Clear OSS and commercial boundaries across building-block, UI engine, control plane, and license server.</p>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
