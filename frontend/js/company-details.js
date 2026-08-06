import { fetchApi } from './api.js';

const statusMessage = document.querySelector('#details-status');
const companyContent = document.querySelector('#company-content');
const companyProfile = document.querySelector('#company-profile');
const benefitsList = document.querySelector('#benefits-list');
const verifiedSalaryList = document.querySelector('#verified-salary-list');
const communitySalaryList = document.querySelector('#community-salary-list');

function appendTextElement(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;

  if (className) {
    element.className = className;
  }

  parent.append(element);
  return element;
}

function renderCompany(company) {
  companyProfile.replaceChildren();

  const heading = appendTextElement(companyProfile, 'h1', company.companyName);
  heading.id = 'company-name';
  appendTextElement(companyProfile, 'p', company.industry, 'industry');

  const metadata = document.createElement('div');
  metadata.className = 'profile-meta';
  appendTextElement(metadata, 'span', `${company.headquartersCity}, ${company.country}`);

  if (company.companySize) {
    appendTextElement(metadata, 'span', `Company size: ${company.companySize}`);
  }

  companyProfile.append(metadata);
  appendTextElement(
    companyProfile,
    'p',
    company.description || 'No company description is available yet.',
    'company-description'
  );

  if (company.website) {
    try {
      const websiteUrl = new URL(company.website);

      if (websiteUrl.protocol === 'http:' || websiteUrl.protocol === 'https:') {
        const website = document.createElement('a');
        website.className = 'company-website';
        website.href = websiteUrl.href;
        website.target = '_blank';
        website.rel = 'noopener noreferrer';
        website.textContent = 'Visit company website';
        companyProfile.append(website);
      }
    } catch (error) {
      // Invalid website values are omitted instead of creating an unsafe link.
    }
  }

  document.title = `${company.companyName} | Saple`;
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
    appendTextElement(card, 'h3', benefit.benefitName);

    if (benefit.benefitCategory) {
      appendTextElement(card, 'p', benefit.benefitCategory, 'benefit-category');
    }

    if (benefit.description) {
      appendTextElement(card, 'p', benefit.description, 'benefit-detail');
    }

    if (benefit.details) {
      appendTextElement(card, 'p', benefit.details, 'benefit-detail');
    }

    if (benefit.eligibility) {
      appendTextElement(card, 'p', `Eligibility: ${benefit.eligibility}`, 'benefit-detail');
    }

    benefitsList.append(card);
  });
}

function formatSalary(value, currency) {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  try {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(value);
  } catch (error) {
    return `${Number(value).toLocaleString()} ${currency}`;
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
    card.className = 'salary-card';
    appendTextElement(card, 'h3', summary.roleName);
    card.append(
      createSalaryMetric('Minimum', formatSalary(summary.minimumSalary, summary.currency)),
      createSalaryMetric('Maximum', formatSalary(summary.maximumSalary, summary.currency)),
      createSalaryMetric('Average', formatSalary(summary.averageSalary, summary.currency)),
      createSalaryMetric(
        summary.payPeriod === 'YEARLY' ? 'Yearly entries' : 'Monthly entries',
        String(summary.contributionCount)
      )
    );
    container.append(card);
  });
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add('error');
  statusMessage.hidden = false;
  companyContent.hidden = true;
}

async function loadCompanyDetails() {
  const companyIdValue = new URLSearchParams(window.location.search).get('id');

  const companyId = Number(companyIdValue);

  if (
    !companyIdValue
    || !/^\d+$/.test(companyIdValue)
    || !Number.isSafeInteger(companyId)
    || companyId <= 0
  ) {
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
    renderSalarySummary(
      verifiedSalaryList,
      salarySummary.verified,
      'No verified salary information is available for this company.'
    );
    renderSalarySummary(
      communitySalaryList,
      salarySummary.community,
      'No community salary information is available for this company.'
    );

    statusMessage.hidden = true;
    companyContent.hidden = false;
  } catch (error) {
    showError(error.message);
  }
}

loadCompanyDetails();
