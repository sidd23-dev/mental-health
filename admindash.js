const API_URL = 'http://localhost:5000/api/admin';

async function loadDoctors() {
    try {
        const res = await fetch(`${API_URL}/pending-doctors`);
        const doctors = await res.json();
        
        const tables = {
            pending: document.getElementById('pendingDoctorsTable'),
            approved: document.getElementById('approvedDoctorsTable'),
            rejected: document.getElementById('rejectedDoctorsTable')
        };

        // Clear all tables before reloading
        Object.values(tables).forEach(t => { if(t) t.innerHTML = ''; });

        doctors.forEach(doc => {
            // Inside the row template in loadDoctors function
const row = `
    <tr>
        <td>Dr. ${doc.firstName} ${doc.lastName}</td>
        <td>${doc.specialization}</td>
        <td>${doc.experience || 0} Years</td> 
        <td>${doc.registrationId || 'N/A'}</td> 
        <td>
            ${doc.certificate ? `<a href="http://localhost:5000/${doc.certificate}" target="_blank" style="color:blue; text-decoration:underline;">View Doc</a>` : 'No File'}
        </td>
        <td>${doc.email}</td>
        <td>${doc.clinicName}</td>
        <td>${renderStatusOrActions(doc)}</td>
    </tr>`;

            if (tables[doc.status]) {
                tables[doc.status].innerHTML += row;
            }
        });

        // Update Counter Cards
        document.getElementById('pendingCount').innerText = doctors.filter(d => d.status === 'pending').length;
        document.getElementById('totalDocs').innerText = doctors.filter(d => d.status === 'approved').length;
        document.getElementById('rejectedCount').innerText = doctors.filter(d => d.status === 'rejected').length;

    } catch (err) {
        console.error("Dashboard Sync Error:", err);
    }
}

// admindash.js file
function logoutAdmin() {
    // 1. Remove the security keys from memory
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminEmail');
    
    // 2. Redirect back to login
    window.location.href = 'admlogin.html';
}
function renderStatusOrActions(doc) {
    if (doc.status === 'pending') {
        return `
            <button class="btn btn-success" onclick="updateStatus('${doc.email}', 'approved')">Approve</button>
            <button class="btn btn-danger" onclick="updateStatus('${doc.email}', 'rejected')">Reject</button>`;
    } else if (doc.status === 'approved') {
        return `<span class="status-badge status-approved">Approved</span>`;
    } else {
        return `
            <span class="status-badge status-rejected">Rejected</span>
            <button class="btn btn-secondary" onclick="updateStatus('${doc.email}', 'pending')">Undo</button>`;
    }
}

async function updateStatus(email, status) {
    try {
        await fetch(`${API_URL}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, status })
        });
        loadDoctors(); // Refresh immediately
    } catch (err) {
        alert("Action failed.");
    }
}

// Initial Load
loadDoctors();