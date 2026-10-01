const userRepository = require('../repositories/user.repository');
const sectionRepository = require('../repositories/professional-profile.repository');
const mlScreening = require('./ml-screening.service');
const mlRepository = require('../repositories/ml-screening.repository');

// The snapshot contains only public profile fields. It is used to make a
// pending revision reviewable without sending or storing account secrets.
async function loadSnapshot(userId) {
  const [user, sections] = await Promise.all([
    userRepository.findSafeUserById(userId),
    sectionRepository.listSections(userId)
  ]);
  if (!user) return null;
  return {
    fullName: user.fullName,
    headline: user.headline || null,
    bio: user.bio || null,
    education: sections.education || [],
    experience: sections.experience || [],
    skills: sections.skills || []
  };
}

function features(snapshot) {
  return {
    headline: snapshot.headline,
    bio: snapshot.bio,
    skills: (snapshot.skills || []).map((item) => item.name),
    education: (snapshot.education || []).map((item) => ({
      institution: item.institution, degree: item.degree, fieldOfStudy: item.fieldOfStudy,
      description: item.description, startDate: item.startDate, endDate: item.endDate
    })),
    experience: (snapshot.experience || []).map((item) => ({
      organization: item.organization, jobTitle: item.jobTitle, employmentType: item.employmentType,
      location: item.location, description: item.description, startDate: item.startDate, endDate: item.endDate
    }))
  };
}

async function submit(userId, previousSnapshot, proposedSnapshot) {
  const screening = await mlScreening.screen('PROFILE', features(proposedSnapshot));
  if (!screening) return { applied: false, publicationState: 'CONFIRMED', screening: null };
  const result = await mlRepository.recordProfileRevision({
    userId, previousSnapshot, proposedSnapshot, screening
  });
  return { ...result, screening };
}

module.exports = { loadSnapshot, features, submit };
