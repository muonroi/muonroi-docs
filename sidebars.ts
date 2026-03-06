import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/introduction',
        'getting-started/quickstart',
        'getting-started/quickstart-decision-table',
        'getting-started/template-quickstart',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/architecture-overview',
        'concepts/open-core-model',
        'concepts/tenancy-models',
        'concepts/ef-filters',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        {
          type: 'category',
          label: 'Rule Engine',
          items: [
            'guides/rule-engine/rule-engine-guide',
            'guides/rule-engine/feel-reference',
            'guides/rule-engine/decision-table-guide',
            'guides/rule-engine/decision-table-api-reference',
            'guides/rule-engine/nrules-guide',
            'guides/rule-engine/auto-crud-rules',
            'guides/rule-engine/rulegen-guide',
            'guides/rule-engine/rulegen-vscode-extension',
            'guides/rule-engine/rule-engine-testing-guide',
            'guides/rule-engine/rule-engine-hooks-guide',
            'guides/rule-engine/rule-engine-advanced-patterns',
            'guides/rule-engine/rule-rollout-guide',
          ],
        },
        {
          type: 'category',
          label: 'License Governance',
          items: [
            'guides/license-governance/license-capability-model',
            'guides/license-governance/license-activation',
            'guides/license-governance/tier-enforcement',
          ],
        },
        {
          type: 'category',
          label: 'Multi Tenancy',
          items: [
            'guides/multi-tenancy/multi-tenant-guide',
            'guides/multi-tenancy/tenant-isolation',
            'guides/multi-tenancy/multi-tenant-quota-guide',
            'guides/multi-tenancy/quota-api-reference',
          ],
        },
        {
          type: 'category',
          label: 'Control Plane',
          items: [
            'guides/control-plane/control-plane-overview',
            'guides/control-plane/ruleset-approval-workflow',
            'guides/control-plane/canary-rollout-guide',
            'guides/control-plane/signalr-hot-reload',
          ],
        },
        {
          type: 'category',
          label: 'UI Engine',
          items: [
            'guides/ui-engine/ui-engine-architecture',
            'guides/ui-engine/decision-table-widget',
            'guides/ui-engine/feel-autocomplete-widget',
          ],
        },
        {
          type: 'category',
          label: 'Identity and Access',
          items: [
            'guides/identity-access/auth-module-guide',
            'guides/identity-access/bff-guide',
            'guides/identity-access/oidc-guide',
            'guides/identity-access/permission-guide',
            'guides/identity-access/permission-tree-guide',
            'guides/identity-access/policy-decision-guide',
            'guides/identity-access/token-guide',
            'guides/identity-access/webauthn-mfa-guide',
          ],
        },
        {
          type: 'category',
          label: 'Integration',
          items: [
            'guides/integration/backend-guide',
            'guides/integration/cache-guide',
            'guides/integration/dapper-guide',
            'guides/integration/data-layer',
            'guides/integration/gateway-guide',
            'guides/integration/grpc-guide',
            'guides/integration/signalr-guide',
          ],
        },
        'guides/ecosystem-coding-rules',
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'operations/background-jobs-guide',
        'operations/kubernetes-deployment-guide',
        'operations/ci-cd-docker-k8s',
        'operations/observability-guide',
        'operations/secret-management',
        'operations/canary-shadow',
        'operations/migration-scripts',
        'operations/ruleset-governance-ops',
        'operations/troubleshooting-guide',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/appsettings-guide',
        'reference/database-structure',
        'reference/interface-guide',
        'reference/package-reference',
        'reference/roslyn-analyzers',
      ],
    },
    {
      type: 'category',
      label: 'Resources',
      items: [
        'resources/rule-engine-samples',
        'resources/feature-flags',
        'resources/test-matrix-guide',
        'resources/release-checklist',
        'resources/CHANGELOG',
        'resources/CONTRIBUTING',
        'resources/SECURITY',
        'resources/COMMERCIAL-EDITIONS',
        'resources/OSS-BOUNDARY',
        'resources/samples/loan-approval',
        'resources/samples/multi-tenant-saas',
      ],
    },
  ],
};

export default sidebars;
