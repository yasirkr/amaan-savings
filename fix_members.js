const fs = require('fs');
const f = 'src/pages/AdminDashboard.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Change grid to 4 columns
c = c.replace(/gridTemplateColumns:\s*'repeat\(3,\s*1fr\)'/g, "gridTemplateColumns: 'repeat(4, 1fr)'");

// 2. Locate the Queue button end tag to append the Members button
const target = "<span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Queue</span>\n          </div>";

const membersBtn = `
          <div onClick={() => navigate('/admin/members')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg></div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Members</span>
          </div>`;

if (c.includes(target) && !c.includes("navigate('/admin/members')")) {
  fs.writeFileSync(f, c.replace(target, target + membersBtn));
  console.log('✅ Members button restored & Grid updated to 4 columns successfully!');
} else if (c.includes("navigate('/admin/members')")) {
  console.log('✅ Members button is already present.');
} else {
  console.log('⚠️ Target Queue block not found. Make sure the file matches the expected structure.');
}
