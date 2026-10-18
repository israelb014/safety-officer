// Small inline-SVG phone illustrations for the step-by-step instructions.
const frame = (inner) => `
  <svg class="illus" viewBox="0 0 80 132" width="80" height="132" aria-hidden="true">
    <rect x="3" y="3" width="74" height="126" rx="13" fill="#fff" stroke="#1a3a5c" stroke-width="3"/>
    <rect x="30" y="8" width="20" height="4" rx="2" fill="#1a3a5c" opacity=".35"/>
    ${inner}
  </svg>`;

const HL = '#f59e0b';

const ART = {
  appstore: frame(`
    <rect x="11" y="20" width="58" height="10" rx="5" fill="#e8eef5"/>
    <circle cx="18" cy="25" r="2.6" fill="none" stroke="#5a7090" stroke-width="1.4"/>
    <text x="40" y="27.5" font-size="6" font-family="sans-serif" fill="#5a7090" text-anchor="middle">ntfy</text>
    <rect x="11" y="40" width="22" height="22" rx="6" fill="#2a5080"/>
    <path d="M17 55h10M22 45a4.5 4.5 0 0 1 4.5 4.5c0 3.5 1.5 5 1.5 5H16s1.5-1.5 1.5-5A4.5 4.5 0 0 1 22 45z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="37" y="43" width="22" height="4" rx="2" fill="#1a3a5c"/>
    <rect x="37" y="51" width="15" height="3" rx="1.5" fill="#b8c6d6"/>
    <rect class="pulse" x="47" y="66" width="22" height="10" rx="5" fill="${HL}"/>
    <rect x="11" y="86" width="58" height="3" rx="1.5" fill="#e8eef5"/>
    <rect x="11" y="94" width="44" height="3" rx="1.5" fill="#e8eef5"/>`),
  plus: frame(`
    <rect x="11" y="20" width="30" height="5" rx="2.5" fill="#1a3a5c"/>
    <rect x="11" y="34" width="58" height="12" rx="4" fill="#e8eef5"/>
    <rect x="11" y="50" width="58" height="12" rx="4" fill="#e8eef5"/>
    <circle class="pulse" cx="58" cy="108" r="11" fill="${HL}"/>
    <path d="M58 102v12M52 108h12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`),
  topic: frame(`
    <rect x="11" y="22" width="40" height="5" rx="2.5" fill="#1a3a5c"/>
    <rect class="pulse-stroke" x="11" y="36" width="58" height="14" rx="4" fill="#fff" stroke="${HL}" stroke-width="2"/>
    <rect x="15" y="41.5" width="34" height="3" rx="1.5" fill="#5a7090"/>
    <rect x="11" y="58" width="58" height="22" rx="4" fill="#e8eef5"/>
    <path d="M18 63v12M21 63v12M25 63v12M27 63v12M31 63v12M35 63v12M37 63v12M41 63v12M44 63v12M48 63v12M50 63v12M54 63v12M58 63v12M61 63v12" stroke="#1a3a5c" stroke-width="1.2"/>
    <rect x="35" y="92" width="34" height="12" rx="6" fill="#1a3a5c"/>`),
  allow: frame(`
    <rect x="9" y="20" width="62" height="92" rx="8" fill="#e8eef5"/>
    <rect x="15" y="40" width="50" height="50" rx="7" fill="#fff" stroke="#b8c6d6"/>
    <rect x="21" y="47" width="38" height="4" rx="2" fill="#1a3a5c"/>
    <rect x="24" y="55" width="32" height="3" rx="1.5" fill="#b8c6d6"/>
    <line x1="15" y1="70" x2="65" y2="70" stroke="#b8c6d6"/>
    <line x1="40" y1="70" x2="40" y2="90" stroke="#b8c6d6"/>
    <rect x="20" y="76" width="14" height="8" rx="3" fill="#b8c6d6"/>
    <rect class="pulse" x="45" y="75" width="16" height="10" rx="3" fill="${HL}"/>`),
  safari: frame(`
    <rect x="11" y="20" width="58" height="8" rx="3" fill="#e8eef5"/>
    <rect x="11" y="34" width="58" height="22" rx="5" fill="#2a5080"/>
    <rect x="11" y="62" width="40" height="4" rx="2" fill="#b8c6d6"/>
    <rect x="11" y="70" width="52" height="4" rx="2" fill="#b8c6d6"/>
    <rect class="pulse-stroke" x="9" y="100" width="62" height="12" rx="6" fill="#fff" stroke="${HL}" stroke-width="2"/>
    <circle cx="40" cy="106" r="3.4" fill="none" stroke="#1a3a5c" stroke-width="1.4"/>
    <path d="m40 104 1.2 2.4-2.4-1.2z" fill="#1a3a5c"/>`),
  share: frame(`
    <rect x="11" y="20" width="58" height="22" rx="5" fill="#2a5080"/>
    <rect x="11" y="48" width="44" height="4" rx="2" fill="#b8c6d6"/>
    <rect x="11" y="56" width="52" height="4" rx="2" fill="#b8c6d6"/>
    <rect x="3" y="104" width="74" height="18" fill="#e8eef5"/>
    <path d="M14 113h6M60 113h6" stroke="#5a7090" stroke-width="1.6" stroke-linecap="round"/>
    <circle class="pulse" cx="40" cy="113" r="8" fill="${HL}"/>
    <path d="M40 108v7M37 110.5l3-3 3 3M36 113v4h8v-4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  addhome: frame(`
    <rect x="9" y="30" width="62" height="86" rx="8" fill="#e8eef5"/>
    <rect x="14" y="38" width="52" height="12" rx="3" fill="#fff"/>
    <rect x="14" y="54" width="52" height="12" rx="3" fill="#fff"/>
    <rect class="pulse-stroke" x="14" y="70" width="52" height="14" rx="3" fill="#fff" stroke="${HL}" stroke-width="2"/>
    <rect x="18" y="75.5" width="26" height="3" rx="1.5" fill="#1a3a5c"/>
    <rect x="53" y="72.5" width="9" height="9" rx="2.5" fill="none" stroke="#1a3a5c" stroke-width="1.4"/>
    <path d="M57.5 74.8v4.4M55.3 77h4.4" stroke="#1a3a5c" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="14" y="88" width="52" height="12" rx="3" fill="#fff"/>`),
  add: frame(`
    <rect class="pulse" x="11" y="18" width="18" height="10" rx="5" fill="${HL}"/>
    <rect x="52" y="20" width="17" height="5" rx="2.5" fill="#b8c6d6"/>
    <rect x="28" y="40" width="24" height="24" rx="6" fill="#1a3a5c"/>
    <path d="M40 45s6-2.5 6-7.5v-.5l-6-2-6 2v.5c0 5 6 7.5 6 7.5z" transform="translate(0 12)" fill="none" stroke="#fff" stroke-width="1.6"/>
    <rect x="22" y="70" width="36" height="5" rx="2.5" fill="#e8eef5"/>
    <rect x="11" y="86" width="58" height="3" rx="1.5" fill="#e8eef5"/>`),
};

export function illus(name) {
  return `<span class="illus-wrap">${ART[name] || ''}</span>`;
}
