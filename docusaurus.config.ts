import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Muonroi Docs',
  tagline: 'Documentation for the Muonroi open-core ecosystem',
  favicon: 'img/favicon.ico',

  url: 'https://docs.muonroi.com',
  baseUrl: '/',

  organizationName: 'muonroi',
  projectName: 'Muonroi.Docs',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {
      en: { label: 'English' },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/docs',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/muonroi/Muonroi.Docs/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Muonroi Docs',
      logo: {
        alt: 'Muonroi Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/muonroi/Muonroi.Docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/docs/getting-started/introduction' },
            { label: 'Quickstart', to: '/docs/getting-started/quickstart' },
          ],
        },
        {
          title: 'Repos',
          items: [
            { label: 'Muonroi.Docs', href: 'https://github.com/muonroi/Muonroi.Docs' },
            { label: 'Muonroi.BuildingBlock', href: 'https://github.com/muonroi/Muonroi.BuildingBlock' },
          ],
        },
      ],
      copyright: `Copyright (c) ${new Date().getFullYear()} Muonroi. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['csharp', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
