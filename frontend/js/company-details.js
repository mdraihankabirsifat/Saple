import { apiRequest, fetchApi } from './api.js';
import { getToken } from './auth.js';

const statusMessage = document.querySelector('#details-status');
const companyContent = document.querySelector('#company-content');
const companyProfile = document.querySelector('#overview');
const benefitsList = document.querySelector('#benefits-list');
const verifiedSalaryList = document.querySelector('#verified-salary-list');
const communitySalaryList = document.querySelector('#community-salary-list');
const reviewSummary = document.querySelector('#review-summary');
const reviewsList = document.querySelector('#reviews-list');
const interviewsList = document.querySelector('#interviews-list');
const reportDialog = document.querySelector('#report-dialog');
const reportReason = document.querySelector('#report-reason');
const reportDescription = document.querySelector('#report-description');
const reportStatus = document.querySelector('#report-status');
const submitReportButton = document.querySelector('#submit-report');
let reportSubmissionId = null;

function appendTextElement(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderCompany(company) {
  const heading = document.querySelector('#company-name');
  companyProfile.replaceChildren();

  const titleRow = document.createElement('div');
  const monogram = appendTextElement(titleRow, 'span', company.companyName?.trim().charAt(0).toUpperCase() || 'S', 'company-profile-mark');
  const titleCopy = document.createElement('div');
  titleRow.className = 'company-title-row';
  monogram.setAttribute('aria-hidden', 'true');
  heading.textContent = company.companyName || 'Company';
  heading.classList.remove('sr-only');
  const headingLine = document.createElement('div');
  const count = Number(company.reviewCount) || 0;
  const ratingText = count
    ? `★ ${Number(company.averageRating).toFixed(1)} (${count} ${count === 1 ? 'review' : 'reviews'})`
    : 'No rating yet';
  headingLine.className = 'company-heading-line';
  headingLine.append(heading);
  appendTextElement(headingLine, 'span', ratingText, 'company-rating');
  titleCopy.append(headingLine);

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

function reportButton(submissionId) {
  const button = document.createElement('button');
  button.className = 'button button-secondary button-small report-action';
  button.type = 'button'; button.textContent = 'Report';
  button.addEventListener('click', () => {
    if (!getToken()) { window.location.assign(`login.html?returnTo=${encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search)}`); return; }
    reportSubmissionId = submissionId; reportReason.value = ''; reportDescription.value = ''; reportStatus.hidden = true; reportDialog.showModal();
  });
  return button;
}

function renderReviews(data) {
  reviewsList.replaceChildren(); reviewSummary.replaceChildren();
  const reviews = data?.reviews || []; const summary = data?.summary;
  if (summary?.reviewCount > 0) {
    reviewSummary.className = 'review-summary card';
    [['Approved reviews', summary.reviewCount], ['Overall average', summary.overallAverage], ['Work-life', summary.workLifeBalanceAverage], ['Growth', summary.careerGrowthAverage], ['Management', summary.managementAverage], ['Culture', summary.cultureAverage]].forEach(([label, value]) => appendTextElement(reviewSummary, 'span', `${label}: ${value}`));
  }
  if (!reviews.length) { appendTextElement(reviewsList, 'p', 'No approved reviews are available for this company.', 'empty-state'); return; }
  reviews.forEach((review) => {
    const card = document.createElement('article'); card.className = 'experience-card card';
    const header = document.createElement('div'); header.className = 'experience-card-header';
    const copy = document.createElement('div'); appendTextElement(copy, 'h3', review.reviewTitle);
    appendTextElement(copy, 'p', `${review.roleName || 'Role not specified'} · ${review.employmentStatus} · ${review.verificationStatus}`, 'experience-meta');
    appendTextElement(header, 'span', `${review.overallRating}/5`, 'badge'); header.prepend(copy); card.append(header);
    const body = document.createElement('div'); body.className = 'experience-body';
    appendTextElement(body, 'p', `Pros: ${review.pros}`); appendTextElement(body, 'p', `Cons: ${review.cons}`);
    if (review.adviceToManagement) appendTextElement(body, 'p', `Advice: ${review.adviceToManagement}`);
    appendTextElement(body, 'p', `${review.authorName || 'Anonymous contributor'} · ${new Date(review.reviewDate).toLocaleDateString()}`, 'experience-meta');
    card.append(body, reportButton(review.submissionId)); reviewsList.append(card);
  });
}

function renderInterviews(interviews) {
  interviewsList.replaceChildren();
  if (!interviews.length) { appendTextElement(interviewsList, 'p', 'No approved interview experiences are available for this company.', 'empty-state'); return; }
  interviews.forEach((item) => {
    const card = document.createElement('article'); card.className = 'experience-card card';
    appendTextElement(card, 'h3', item.roleName); appendTextElement(card, 'p', `${item.difficultyLevel} · ${item.roundsCount} rounds · ${item.interviewMode} · ${item.resultStatus}`, 'experience-meta');
    const body = document.createElement('div'); body.className = 'experience-body';
    appendTextElement(body, 'p', item.processDescription); if (item.questionsSummary) appendTextElement(body, 'p', `Topics: ${item.questionsSummary}`);
    appendTextElement(body, 'p', `${item.durationDays} days · ${item.verificationStatus} · ${item.authorName || 'Anonymous contributor'}`, 'experience-meta');
    card.append(body, reportButton(item.submissionId)); interviewsList.append(card);
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
    const [company, benefits, salarySummary, reviews, interviews] = await Promise.all([
      fetchApi(`/api/companies/${companyId}`),
      fetchApi(`/api/companies/${companyId}/benefits`),
      fetchApi(`/api/companies/${companyId}/salary-summary`),
      fetchApi(`/api/companies/${companyId}/reviews`),
      fetchApi(`/api/companies/${companyId}/interviews`)
    ]);

    renderCompany(company);
    renderBenefits(benefits);
    renderSalarySummary(verifiedSalaryList, salarySummary.verified, 'No verified salary information is available for this company.');
    renderSalarySummary(communitySalaryList, salarySummary.community, 'No community salary information is available for this company.');
    renderReviews(reviews);
    renderInterviews(interviews);

    statusMessage.hidden = true;
    companyContent.hidden = false;
    companyContent.setAttribute('aria-busy', 'false');
  } catch (error) {
    showError(error.message);
  }
}

document.querySelector('#submit-report').addEventListener('click', async () => {
  if (!reportReason.value || !reportSubmissionId) { reportStatus.textContent = 'Select a report reason.'; reportStatus.className = 'state-message error'; reportStatus.hidden = false; return; }
  submitReportButton.disabled = true;
  try {
    await apiRequest(`/api/submissions/${reportSubmissionId}/reports`, { method: 'POST', auth: true, body: { reasonCategory: reportReason.value, description: reportDescription.value } });
    reportStatus.textContent = 'Report submitted for review.'; reportStatus.className = 'state-message success'; reportStatus.hidden = false;
  } catch (error) { reportStatus.textContent = error.message; reportStatus.className = 'state-message error'; reportStatus.hidden = false; }
  finally { submitReportButton.disabled = false; }
});

loadCompanyDetails();
