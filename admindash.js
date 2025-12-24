const API_BASE = 'http://localhost:5000';

window.addEventListener('DOMContentLoaded', () => {
  loadOverview();
  loadPendingDoctors();
  setInterval(loadPendingDoctors, 5000); // simple "notification" polling
});

async function loadOverview() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/overview`);
    const data = await res.json();
    if (!res.ok || !data.success) return;

    document.getElementById('totalDoctors').innerText = data.stats.totalDoctors;
    document.getElementById('pendingDoctors').innerText = data.stats.pendingDoctors;
    document.getElementById('totalPatients').innerText = data.stats.totalPatients;
    document.getElementById('totalAppointments').innerText = data.stats.totalAppointments;
  } catch (err) {
    console.error('overview error', err);
  }
}

async function loadPendingDoctors() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/doctors/pending`);
    const data = await res.json();
    if (!res.ok || !data.success) return;

    const tbody = document.getElementById('pendingDoctorsTable');
    tbody.innerHTML = '';

    data.doctors.forEach(doc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Dr. ${doc.firstName} ${doc.lastName}</td>
        <td>${doc.specialization}</td>
        <td>${doc.email}</td>
        <td>${doc.experienceYears} yrs</td>
        <td>${doc.clinicName}</td>
        <td>${doc.registrationId}</td>
        <td>
          <button class="btn btn-success" onclick="approveDoctor('${doc.email}')">Approve</button>
          <button class="btn btn-danger" onclick="rejectDoctor('${doc.email}')">Reject</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('pendingDoctors').innerText = data.doctors.length;
  } catch (err) {
    console.error('pending error', err);
  }
}

async function approveDoctor(email) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/doctors/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadPendingDoctors();
      loadOverview();
      alert('Doctor approved');
    } else {
      alert(data.message || 'Error approving doctor');
    }
  } catch (err) {
    console.error('approve error', err);
  }
}

async function rejectDoctor(email) {
  const confirmDelete = confirm(`Reject and remove doctor ${email}?`);
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/doctors/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadPendingDoctors();
      loadOverview();
      loadApprovedDoctors();
      alert('Doctor rejected and removed');
    } else {
      alert(data.message || 'Error rejecting doctor');
    }
  } catch (err) {
    console.error('reject error', err);
  }
}

// expose for inline onclick
window.rejectDoctor = rejectDoctor;


document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminEmail');
  window.location.href = 'admlogin.html';
});
