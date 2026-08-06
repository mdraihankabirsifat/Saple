const API_BASE_URL = 'http://localhost:3000';

async function fetchApi(path) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json'
      }
    });
  } catch (error) {
    throw new Error('Unable to connect to the Saple API. Make sure the backend is running.');
  }

  let body;

  try {
    body = await response.json();
  } catch (error) {
    throw new Error('The Saple API returned an invalid response.');
  }

  if (!response.ok || !body.success) {
    const apiError = new Error(body.message || 'The request could not be completed.');
    apiError.status = response.status;
    throw apiError;
  }

  return body.data;
}

export {
  API_BASE_URL,
  fetchApi
};
