import { fetchApi } from './api.js';

const statusMessage = document.querySelector('#details-status');
const companyContent = document.querySelector('#company-content');
const companyProfile = document.querySelector('#overview');
const benefitsList = document.querySelector('#benefits-list');
const verifiedSalaryList = document.querySelector('#verified-salary-list');
const communitySalaryList = document.querySelector('#community-salary-list');

function appendTextElement(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderCompany(company) {
  companyProfile.replaceChildren();

  const titleRow = document.createElement('div');
  const monogram = appendTextElement(titleRow, 'span', company.companyName?.trim().charAt(0).toUpperCase() || 'S', 'company-profile-mark');
  const titleCopy = document.createElement('div');
  const heading = appendTextElement(titleCopy, 'h1', company.companyName || 'Company');
  titleRow.className = 'company-title-row';
  monogram.setAttribute('aria-hidden', 'true');
  heading.id = 'company-name';

  if (company.industry) appendTextElement(titleCopy, 'p', company.industry, 'industry');
  titleRow.append(titleCopy);
  companyProfile.append(titleRow);

  const metadata = document.createElement('div');
  const location = [company.headquartersCity, company.country].filter(Boolean).join(', ');
  metadata.className = 'profile-meta';
  if (location) appendTextElement(metadata, 'span', location);
  if (company.companySize) appendTextElement(metadata, 'span', `Company size: ${company.companySize}`);
  if (metadata.childElementCount > 0) companyProfile.append(metadata);

  appendTextElement(companyProfile, 'p', company.description || 'No company description is available yet.', 'company-description');

  if (company.website) {
    try {
      const websiteUrl = new URL(company.website);
      if (websiteUrl.protocol === 'http:' || websiteUrl.protocol === 'https:') {
        const website = document.createElement('a');
        website.className = 'company-website';
        website.href = websiteUrl.href;
        website.target = '_blank';
        website.rel = 'noopener noreferrer';
        website.textContent = 'Visit company website \u2197';
        companyProfile.append(website);
      }
    } catch (error) {
      // Invalid website values are omitted instead of creating an unsafe link.
    }
  }

  document.title = `${company.companyName || 'Company'} | Saple`;
}

function renderBenefits(benefits) {
  benefitsList.replaceChildren();

  if (!Array.isArray(benefits) || benefits.length === 0) {
    appendTextElement(benefitsList, 'p', 'No benefits have been recorded for this company.', 'empty-state');
    return;
  }

  benefits.forEach((benefit) => {
    const card = document.createElement('article');
    card.className = 'benefit-card';
    appendTextElement(card, 'h3', benefit.benefitName || 'Benefit');
    if (benefit.benefitCategory) appendTextElement(card, 'p', benefit.benefitCategory, 'benefit-category');
    if (benefit.description) appendTextElement(card, 'p', benefit.description, 'benefit-detail');
    if (benefit.details) appendTextElement(card, 'p', benefit.details, 'benefit-detail');
    if (benefit.eligibility) appendTextElement(card, 'p', `Eligibility: ${benefit.eligibility}`, 'benefit-detail');
    benefitsList.append(card);
  });
}

function formatSalary(value, currency) {
  if (value === null || value === undefined) return 'Not available';

  try {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: currency || 'BDT',
      maximumFractionDigits: 2
    }).format(value);
  } catch (error) {
    return `${Number(value).toLocaleString('en-BD')} ${currency || 'BDT'}`;
  }
}

function createSalaryMetric(label, value) {
  const paragraph = document.createElement('p');
  const labelElement = document.createElement('span');
  const valueElement = document.createElement('strong');
  paragraph.className = 'salary-metric';
  labelElement.textContent = label;
  valueElement.textContent = value;
  paragraph.append(labelElement, valueElement);
  return paragraph;
}

function renderSalarySummary(container, summaries, emptyMessage) {
  container.replaceChildren();

  if (!Array.isArray(summaries) || summaries.length === 0) {
    appendTextElement(container, 'p', emptyMessage, 'empty-state');
    return;
  }

  summaries.forEach((summary) => {
    const card = document.createElement('article');
    const cardHeader = document.createElement('div');
    card.className = 'salary-card';
    cardHeader.className = 'salary-card-header';
    appendTextElement(cardHeader, 'h4', summary.roleName || 'Role');
    appendTextElement(cardHeader, 'span', summary.payPeriod === 'YEARLY' ? 'Yearly pay' : 'Monthly pay', 'pay-period');
    card.append(
      cardHeader,
      createSalaryMetric('Minimum', formatSalary(summary.minimumSalary, summary.currency)),
      createSalaryMetric('Maximum', formatSalary(summary.maximumSalary, summary.currency)),
      createSalaryMetric('Average', formatSalary(summary.averageSalary, summary.currency)),
      createSalaryMetric('Contributions', String(summary.contributionCount ?? 0))
    );
    container.append(card);
  });
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add('error');
  statusMessage.hidden = false;
  companyContent.hidden = true;
  companyContent.setAttribute('aria-busy', 'false');
}

async function loadCompanyDetails() {
  const companyIdValue = new URLSearchParams(window.location.search).get('id');
  const companyId = Number(companyIdValue);

  if (!companyIdValue || !/^\d+$/.test(companyIdValue) || !Number.isSafeInteger(companyId) || companyId <= 0) {
    showError('Invalid company ID. Return to the company directory and select a company.');
    return;
  }

  try {
    const [company, benefits, salarySummary] = await Promise.all([
      fetchApi(`/api/companies/${companyId}`),
      fetchApi(`/api/companies/${companyId}/benefits`),
      fetchApi(`/api/companies/${companyId}/salary-summary`)
    ]);

    renderCompany(company);
    renderBenefits(benefits);
    renderSalarySummary(verifiedSalaryList, salarySummary.verified, 'No verified salary information is available for this company.');
    renderSalarySummary(communitySalaryList, salarySummary.community, 'No community salary information is available for this company.');

    statusMessage.hidden = true;
    companyContent.hidden = false;
    companyContent.setAttribute('aria-busy', 'false');
  } catch (error) {
    showError(error.message);
  }
}

loadCompanyDetails();
