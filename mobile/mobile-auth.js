// mobile-auth.js — shared auth utilities for mobile pages
(function () {
  'use strict';

  function clearAndRedirect() {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('mobile_pin_ok');
    window.location.replace('index.html');
  }

  /**
   * Authenticated fetch wrapper.
   * Automatically injects Bearer token, parses JSON, and redirects to login on 401.
   * Drop-in for fetch() — returns a Promise resolving to parsed JSON.
   */
  window.mobileFetch = function (url, opts) {
    var token = localStorage.getItem('auth_token') || '';
    var defaultHeaders = { 'Authorization': 'Bearer ' + token };
    var merged = Object.assign({}, opts || {});
    merged.headers = Object.assign(defaultHeaders, (opts && opts.headers) || {});
    return fetch(url, merged).then(function (r) {
      if (r.status === 401) {
        clearAndRedirect();
        return Promise.reject(new Error('Session expired'));
      }
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        return r.json().catch(function() { return null; }).then(function(body) {
          if (body) err.body = body;
          return Promise.reject(err);
        });
      }
      return r.json();
    });
  };

  /** Returns auth header object — still useful for pages building headers manually. */
  window.mobileAuthHeaders = function () {
    return { 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') };
  };

  /**
   * Call after any raw fetch response.
   * If status is 401 it clears auth and redirects, returning true.
   * Usage: if (mobileHandle401(res)) return;
   */
  window.mobileHandle401 = function (res) {
    if (res && res.status === 401) {
      clearAndRedirect();
      return true;
    }
    return false;
  };
})();
