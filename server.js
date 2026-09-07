import React, { useState } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Master Data: 実習実施者（受入企業）リスト
  const [companies, setCompanies] = useState([
    { id: 1, code: 'JSS-10023', nameKanji: '株式会社 田中鉄工', employeeCount: 28, currentTts: 2, prefecture: '東京都' },
    { id: 2, code: 'JSS-10024', nameKanji: 'ヤマト食品 株式会社', employeeCount: 45, currentTts: 4, prefecture: '埼玉県' },
    { id: 3, code: 'JSS-10025', nameKanji: '鈴木建設 株式会社', employeeCount: 15, currentTts: 3, prefecture: '神奈川県' }
  ]);

  // Form State: 技能実習計画認定申請
  const [selectedCompanyId, setSelectedCompanyId] = useState('1');
  const [workerName, setWorkerName] = useState('NGUYEN VAN A');
  const [passport, setPassport] = useState('C12345678');
  const [instructorExp, setInstructorExp] = useState(8);
  const [hourlyWage, setHourlyWage] = useState(1120);
  const [validationResult, setValidationResult] = useState(null);

  // OTIT 法令チェック＆書類自動生成ロジック
  const handleValidateAndGenerate = (e) => {
    e.preventDefault();
    setValidationResult(null);

    const company = companies.find(c => c.id === Number(selectedCompanyId));
    let errors = [];

    // Rule 1: 受入人数枠チェック（常勤職員数に基づく）
    let maxQuota = 3;
    if (company.employeeCount > 50) maxQuota = 6;
    else if (company.employeeCount > 40) maxQuota = 5;
    else if (company.employeeCount > 30) maxQuota = 4;

    if (company.currentTts >= maxQuota) {
      errors.push(`【受入枠超過】${company.nameKanji} は現在の受入上限（${maxQuota}名/年）に達しています。`);
    }

    // Rule 2: 技能実習指導員の要件チェック（実務経験5年以上）
    if (Number(instructorExp) < 5) {
      errors.push(`【指導員要件不備】技能実習指導員の経験年数が不足しています（現在: ${instructorExp}年 / 必要: 5年以上）。`);
    }

    // Rule 3: 地域別最低賃金チェック（例: 東京都 1,113円）
    if (Number(hourlyWage) < 1113) {
      errors.push(`【賃金不備】基本賃金（${hourlyWage}円）が地域別最低賃金（1,113円）を下回っています。`);
    }

    if (errors.length > 0) {
      setValidationResult({ status: 'ERROR', errors });
    } else {
      setValidationResult({
        status: 'SUCCESS',
        message: '法令チェック完了：申請書類の自動生成が可能です。',
        details: {
          company: company.nameKanji,
          worker: workerName,
          passport: passport,
          wage: `${hourlyWage} 円/時間`,
          files: ['技能実習計画認定申請書 (様式第1-1号).xlsx', '技能実習生の名簿.xlsx', '雇用条件書.docx']
        }
      });
    }
  };

  // CSV/Excel ファイル出力機能（実機能）
  const downloadDocument = () => {
    const company = companies.find(c => c.id === Number(selectedCompanyId));
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + "項目,申請内容\n"
      + `実習実施者名,${company.nameKanji}\n`
      + `技能実習生氏名,${workerName}\n`
      + `旅券番号,${passport}\n`
      + `基本賃金,${hourlyWage}円\n`
      + `指導員経験年数,${instructorExp}年\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `OTIT_申請データ_${workerName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ fontFamily: '"Hiragino Sans", "Meiryo", sans-serif', backgroundColor: '#f1f5f9', minHeight: '100vh', margin: 0 }}>
      
      {/* ナビゲーションバー */}
      <header style={{ backgroundColor: '#0f172a', color: '#fff', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🏛️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>監理団体業務管理システム</h2>
            <small style={{ color: '#94a3b8' }}>OTIT認定申請・特定技能支援自動化プラットフォーム</small>
          </div>
        </div>
        <nav>
          <button onClick={() => setActiveTab('dashboard')} style={navStyle(activeTab === 'dashboard')}>ダッシュボード</button>
          <button onClick={() => setActiveTab('companies')} style={navStyle(activeTab === 'companies')}>実習実施者管理</button>
          <button onClick={() => setActiveTab('generate')} style={navStyle(activeTab === 'generate')}>認定申請書作成</button>
        </nav>
      </header>

      {/* メインコンテンツ */}
      <main style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '25px' }}>
              <div style={cardStyle}>
                <small style={{ color: '#64748b', fontWeight: 'bold' }}>受入企業数</small>
                <h2 style={{ margin: '10px 0 0 0', color: '#0f172a' }}>65 社</h2>
              </div>
              <div style={{ ...cardStyle, borderTop: '4px solid #2563eb' }}>
                <small style={{ color: '#64748b', fontWeight: 'bold' }}>技能実習生数 (1~3号)</small>
                <h2 style={{ margin: '10px 0 0 0', color: '#2563eb' }}>142 名</h2>
              </div>
              <div style={{ ...cardStyle, borderTop: '4px solid #059669' }}>
                <small style={{ color: '#64748b', fontWeight: 'bold' }}>特定技能外国人</small>
                <h2 style={{ margin: '10px 0 0 0', color: '#059669' }}>38 名</h2>
              </div>
              <div style={{ ...cardStyle, borderTop: '4px solid #d97706' }}>
                <small style={{ color: '#64748b', fontWeight: 'bold' }}>申請中案件 (OTIT)</small>
                <h2 style={{ margin: '10px 0 0 0', color: '#d97706' }}>5 件</h2>
              </div>
            </div>

            {/* アラート通知 */}
            <div style={{ ...cardStyle, borderLeft: '6px solid #ef4444' }}>
              <h3 style={{ marginTop: 0, color: '#dc2626' }}>⚠️ 業務アラート・期限通知</h3>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8', margin: 0 }}>
                <li><strong style={{ color: '#dc2626' }}>[在留資格更新]:</strong> 技能実習生 NGUYEN VAN A (田中鉄工) の在留期限まで残り60日です。</li>
                <li><strong style={{ color: '#d97706' }}>[定期監査]:</strong> ヤマト食品株式会社の3ヶ月定期監査の期日が接近しています。</li>
                <li><strong style={{ color: '#2563eb' }}>[四半期報告]:</strong> 特定技能支援に関する四半期報告書（出入国在留管理局）の提出準備を行ってください。</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 2: 受入企業管理 */}
        {activeTab === 'companies' && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>実習実施者（受入企業）一覧</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '15px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={tableTdStyle}>企業コード</th>
                  <th style={tableTdStyle}>実習実施者名</th>
                  <th style={tableTdStyle}>所在地</th>
                  <th style={tableTdStyle}>常勤職員数</th>
                  <th style={tableTdStyle}>年間受入可能枠</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={tableTdStyle}><code>{c.code}</code></td>
                    <td style={{ ...tableTdStyle, fontWeight: 'bold' }}>{c.nameKanji}</td>
                    <td style={tableTdStyle}>{c.prefecture}</td>
                    <td style={tableTdStyle}>{c.employeeCount} 名</td>
                    <td style={tableTdStyle}>
                      <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        最大 {c.employeeCount <= 30 ? 3 : c.employeeCount <= 40 ? 4 : 5} 名/年
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: 認定申請書自動生成 */}
        {activeTab === 'generate' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
            
            {/* 入力フォーム */}
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>⚙️ 技能実習計画認定申請 - 情報入力</h3>
              
              <form onSubmit={handleValidateAndGenerate}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>1. 実習実施者の選択:</label>
                  <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} style={inputStyle}>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.nameKanji} (常勤: {c.employeeCount}名)</option>
                    ))}
                  </select>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>2. 技能実習生氏名 (アルファベット):</label>
                  <input type="text" value={workerName} onChange={e => setWorkerName(e.target.value)} style={inputStyle} />
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>3. 旅券番号 (Passport No.):</label>
                  <input type="text" value={passport} onChange={e => setPassport(e.target.value)} style={inputStyle} />
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>4. 技能実習指導員の実務経験年数:</label>
                  <input type="number" value={instructorExp} onChange={e => setInstructorExp(e.target.value)} style={inputStyle} />
                  <small style={{ color: '#dc2626' }}>※5未満を入力するとエラー検証テストが可能です。</small>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>5. 基本賃金 (時給換算・円):</label>
                  <input type="number" value={hourlyWage} onChange={e => setHourlyWage(e.target.value)} style={inputStyle} />
                  <small style={{ color: '#dc2626' }}>※1113未満を入力すると最低賃金割れエラーになります。</small>
                </div>

                <button type="submit" style={submitBtnStyle}>
                  🔍 法令チェック＆書類生成実行
                </button>
              </form>
            </div>

            {/* 結果表示・ダウンロード */}
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>📋 審査結果・申請書類出力</h3>
              
              {!validationResult && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', border: '2px dashed #cbd5e1', borderRadius: '8px' }}>
                  <p>左側のフォームに必要な情報を入力し、<strong>「法令チェック＆書類生成実行」</strong>を押してください。</p>
                </div>
              )}

              {validationResult && validationResult.status === 'ERROR' && (
                <div style={{ padding: '20px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <h4 style={{ color: '#dc2626', margin: '0 0 10px 0' }}>✕ 法令要件不備が検出されました:</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#991b1b', lineHeight: '1.6' }}>
                    {validationResult.errors.map((err, idx) => (
                      <li key={idx} style={{ marginBottom: '8px' }}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult && validationResult.status === 'SUCCESS' && (
                <div style={{ padding: '20px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                  <h4 style={{ color: '#166534', margin: '0 0 10px 0' }}>✓ {validationResult.message}</h4>
                  
                  <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#14532d', marginBottom: '15px' }}>
                    <p><strong>実習実施者:</strong> {validationResult.details.company}</p>
                    <p><strong>実習生:</strong> {validationResult.details.worker} ({validationResult.details.passport})</p>
                    <p><strong>基本賃金:</strong> {validationResult.details.wage}</p>
                  </div>

                  <button onClick={downloadDocument} style={downloadBtnStyle}>
                    📥 申請データをダウンロード (.CSV / Excel)
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

// Inline Style Helper
const navStyle = (active) => ({
  backgroundColor: active ? '#2563eb' : 'transparent',
  color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginLeft: '8px', fontWeight: active ? 'bold' : 'normal'
});
const cardStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const tableTdStyle = { padding: '12px', fontSize: '14px' };
const formGroupStyle = { marginBottom: '15px' };
const labelStyle = { display: 'block', fontWeight: 'bold', fontSize: '14px', marginBottom: '5px', color: '#334155' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '14px' };
const submitBtnStyle = { width: '100%', padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' };
const downloadBtnStyle = { marginTop: '15px', width: '100%', padding: '12px', backgroundColor: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
