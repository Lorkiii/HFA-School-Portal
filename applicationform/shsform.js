// shsform.js
// Validation + UI toggles for SHS form (matches your HTML ids)
document.addEventListener("DOMContentLoaded", function () {
  const returnLink = document.getElementById("return-link");
  if (returnLink) {
    returnLink.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "../applicationform/main.html";
    });
  }
  const studentTypeRadios = document.querySelectorAll('input[name="student-type"]');
  const previousSchoolGroup = document.getElementById("previous-school-group");
  const studentNumberGroup = document.getElementById("student-number-group");
  const studentNumberInput = document.getElementById("student-number");
  const previousSchoolInput = document.getElementById("previous-school");
  const returningStudentDocs = document.getElementById("returning-student-documents");
  const newStudentDocs = document.getElementById("new-student-documents");
  const returningStdRequirements = document.getElementById("returning-std-requirements");
  const newStdRequirements = document.getElementById("new-std-requirements");
  const completionYearGroup = document.getElementById("completion-year-group");

  function handleStudentTypeChange() {
    const selectedValue = document.querySelector('input[name="student-type"]:checked')?.value;
    if (selectedValue === "new") {
      if (previousSchoolGroup) previousSchoolGroup.style.display = "block";
      if (studentNumberGroup) studentNumberGroup.style.display = "none";
      if (studentNumberInput) studentNumberInput.required = false;
      if (previousSchoolInput) previousSchoolInput.required = true;
      if (newStudentDocs) newStudentDocs.style.display = "block";
      if (returningStudentDocs) returningStudentDocs.style.display = "none";
      if (newStdRequirements) newStdRequirements.style.display = "block";
      if (returningStdRequirements) returningStdRequirements.style.display = "none";
      if (completionYearGroup) {
        completionYearGroup.style.display = "block";
        const input = completionYearGroup.querySelector("input");
        if (input) input.required = true;
      }
    } else if (selectedValue === "old") {
      if (studentNumberGroup) studentNumberGroup.style.display = "block";
      if (previousSchoolGroup) previousSchoolGroup.style.display = "none";
      if (studentNumberInput) studentNumberInput.required = true;
      if (previousSchoolInput) previousSchoolInput.required = false;

      if (returningStudentDocs) returningStudentDocs.style.display = "block";
      if (newStudentDocs) newStudentDocs.style.display = "none";
      if (returningStdRequirements) returningStdRequirements.style.display = "block";
      if (newStdRequirements) newStdRequirements.style.display = "none";
      if (completionYearGroup) completionYearGroup.style.display = "none";
    }
  }

  studentTypeRadios.forEach((radio) => radio.addEventListener("change", handleStudentTypeChange));
  handleStudentTypeChange();

  // ----- AGE VALIDATION -----
  const birthDateInput = document.getElementById("birth-date");
  const birthDateError = document.getElementById("birth-date-error");
  const gradeLevelSelect = document.getElementById("grade-level");


  const submitBtn = document.getElementById("submit-btn");

  function validateAge() {
    // defensive: if required DOM nodes are missing, allow submit (other validations will handle)
    if (!birthDateError || !birthDateInput || !gradeLevelSelect) return true;

    const birthDateValue = birthDateInput.value;
    const gradeLevelValue = (gradeLevelSelect.value || "").trim();

    if (!birthDateValue || !gradeLevelValue) {
      birthDateError.style.display = "none";
      birthDateError.textContent = "";
      if (submitBtn) submitBtn.disabled = false;
      return true;
    }

    const birthDate = new Date(birthDateValue);
    if (isNaN(birthDate.getTime())) {
      birthDateError.style.display = "block";
      birthDateError.textContent = "Invalid birthdate format.";
      if (submitBtn) submitBtn.disabled = true;
      return false;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // extract numeric grade (e.g., "Grade 11" -> 11)
    const match = gradeLevelValue.match(/\d+/);
    const gradeNum = match ? match[0] : null;

    const gradeMinAges = { "11": 15, "12": 16 };

    const minAge = gradeNum ? gradeMinAges[gradeNum] : undefined;

    if (!minAge) {
      birthDateError.style.display = "none";
      birthDateError.textContent = "";
      if (submitBtn) submitBtn.disabled = false;
      return true;
    }

    if (age < minAge) {
      birthDateError.style.display = "block";
      birthDateError.textContent = `Age must be at least ${minAge} years old for ${gradeLevelValue} applicants. (Current age: ${age})`;
      if (submitBtn) submitBtn.disabled = true;
      return false;
    } else {
      birthDateError.style.display = "none";
      birthDateError.textContent = "";
      if (submitBtn) submitBtn.disabled = false;
      return true;
    }
  }

  // attach instant validation listeners
  if (birthDateInput) birthDateInput.addEventListener("input", validateAge);
  if (gradeLevelSelect) gradeLevelSelect.addEventListener("change", validateAge);

  // run once on load to initialize state
  validateAge();

  // Expose for other scripts (server) to call before submission
  window.validateAge = validateAge;
  window.handleStudentTypeChange = handleStudentTypeChange;

  // intentionally do not attach form submit here; submission handled by shs-server.js
});
