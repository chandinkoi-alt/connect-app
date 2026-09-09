#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
技能実習計画認定申請書（別記様式第１号）の実物Wordテンプレートに、実データを
直接書き込む。テンプレートは assets/forms/nintei_form1_template.docx
（元の .doc をLibreOfficeで.docx変換したもの。表の罫線・見出し番号は原本のまま）。

使い方:
  python3 fill_form.py <input.json> <output.docx>

input.json の形は routes/applicationCases.js の /:id/pdf ハンドラが組み立てる
データ（company, worker, officers, applicationCase, sendingOrg, supervisingOrg）
と同じ形。
"""
import sys
import json
import re
import os
from datetime import date
import docx

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '../../assets/forms/nintei_form1_template.docx')

PLAN_TYPE_LABELS = {
    'A': 'Ａ(第一号企業単独型技能実習)', 'B': 'Ｂ(第二号企業単独型技能実習)', 'C': 'Ｃ(第三号企業単独型技能実習)',
    'D': 'Ｄ(第一号団体監理型技能実習)', 'E': 'Ｅ(第二号団体監理型技能実習)', 'F': 'Ｆ(第三号団体監理型技能実習)',
}
SUPERVISED_TYPES = {'D', 'E', 'F'}
GEN_2_3_TYPES = {'B', 'C', 'E', 'F'}


def set_paragraph_text(p, text):
    for run in list(p.runs):
        run.text = ''
    if p.runs:
        p.runs[0].text = text
    else:
        p.add_run(text)


def set_cell_lines(cell, lines):
    """cell内の各段落を、行ごとに置き換える。既存の段落数より行数が多ければ追加、
    少なければ余った段落を空にする。"""
    paras = cell.paragraphs
    n = len(paras)
    for i in range(min(n, len(lines))):
        set_paragraph_text(paras[i], lines[i])
    for extra in lines[n:]:
        cell.add_paragraph(extra)
    for p in paras[len(lines):]:
        set_paragraph_text(p, '')


def append_after_label(cell_or_para, label, value):
    """段落の既存テキスト（ラベル＋空白）の末尾に値を書き足す。"""
    text = cell_or_para.text.rstrip('　 ')
    set_paragraph_text(cell_or_para, f'{text}　{value}' if value else cell_or_para.text)


def split_postal_address(address):
    """「〒999-9999 ○○...」形式の1フィールドを郵便番号／住所に分割する
    （lib/invoicePdf.js の splitPostalAddress と同じ正規表現）。"""
    if not address:
        return None, ''
    m = re.match(r'^〒\s*(\d{3}-\d{4})\s*(.*)$', address.strip())
    if not m:
        return None, address.strip()
    return m.group(1), m.group(2)


def format_date_ymd(iso):
    """'2026-04-01' -> ('2026', '4', '1')。空なら空文字3つ。"""
    if not iso:
        return '', '', ''
    parts = iso.split('-')
    if len(parts) != 3:
        return iso, '', ''
    y, m, d = parts
    return y, str(int(m)), str(int(d))


def fill_date_cell(cell, iso, suffix_after_day=''):
    y, m, d = format_date_ymd(iso)
    text = f'　　　{y}年　{m} 月　{d}　日{suffix_after_day}'
    set_cell_lines(cell, [text])


def fill_address_phone_cell(cell, address, phone):
    postal, street = split_postal_address(address)
    line1 = f'〒　{postal or ""}'
    line2 = street
    phone_fmt = phone or ''
    line3 = f'（電話　{phone_fmt}）'
    set_cell_lines(cell, [line1, line2, line3])


def yen(n):
    if not n:
        return ''
    try:
        return f'{int(n):,}'
    except (TypeError, ValueError):
        return str(n)


def calc_age(dob_iso, as_of_iso=None):
    """生年月日と基準日から満年齢を計算する。基準日省略時は本日。"""
    if not dob_iso:
        return ''
    try:
        by, bm, bd = (int(x) for x in dob_iso.split('-'))
    except ValueError:
        return ''
    if as_of_iso:
        try:
            ay, am, ad = (int(x) for x in as_of_iso.split('-'))
            as_of = date(ay, am, ad)
        except ValueError:
            as_of = date.today()
    else:
        as_of = date.today()
    age = as_of.year - by - ((as_of.month, as_of.day) < (bm, bd))
    return str(age)


def mark_checkbox(text, marker, checked):
    """'□ A(...)' の□を■に置き換える（checkedがTrueの時のみ、markerの直後の□を対象に）。"""
    pattern = re.escape(marker)
    return re.sub(rf'□(\s*{pattern})', rf'■\1', text, count=1) if checked else text


def fill_page4(paragraphs, tables, company, ac):
    """第4面 実習実施予定表（1号技能実習＝A・Dのみ）。
    tables[4] は、技能実習の内容①〜⑦（各5行×1ブロック）＋月別時間数の表。
    各ブロックの最終行（例：①なら行2〜6のうち行6）に、事業所・合計時間・
    月別時間数が入る（実物テンプレートをマーカー文字で検証済み）。内容列
    （col2）はブロック内の5行それぞれが独立した1行分の自由記述欄になっている。
    実物様式は「開始月から終了月までを矢印で結び、矢印の上に時間数を書く」
    という表現だが、矢印の描画までは行わず、開始月〜終了月の各列に
    月あたり時間数の数字を書き込む形で簡略化している。
    """
    # 技能実習を行わせる事業所（①のみ。受入企業の情報をそのまま使う）
    set_paragraph_text(
        paragraphs[104],
        f'事業所名　{company.get("name", "")}　　　　　　　　　所在地　{company.get("address", "")}',
    )
    sy, sm, sd = format_date_ymd(ac.get('trainingPeriodStart'))
    ey, em, ed = format_date_ymd(ac.get('trainingPeriodEnd'))
    set_paragraph_text(
        paragraphs[107],
        f'実習期間　　　{sy}年　{sm} 月　{sd}　日　～　　　{ey}年　{em} 月　{ed}　日',
    )

    t = tables[4]
    row = lambda r: t.rows[r].cells
    items = ac.get('trainingContentItems') or []
    for i, it in enumerate(items[:7]):
        base = 2 + i * 5
        anchor = base + 4
        content_lines = [it.get('content', ''), it.get('dutyType', ''), it.get('instructorInfo', '')]
        for j, line in enumerate(content_lines):
            set_cell_lines(row(base + j)[2], [line])
        set_cell_lines(row(anchor)[3], [it.get('workplace') or company.get('name', '')])
        set_cell_lines(row(anchor)[4], [str(it.get('totalHours') or '')])
        start, end, hours = it.get('startMonth'), it.get('endMonth'), it.get('hoursPerMonth')
        if start and end and hours:
            for month in range(int(start), int(end) + 1):
                if 1 <= month <= 12:
                    set_cell_lines(row(anchor)[4 + month], [str(hours)])

    t5 = tables[5]
    row5 = lambda r: t5.rows[r].cells
    set_cell_lines(row5(0)[1], [ac.get('trainingMaterials', '')])
    set_cell_lines(row5(1)[1], [ac.get('trainingTools', '')])


def fill(doc, data):
    company = data.get('company') or {}
    worker = data.get('worker') or {}
    ac = data.get('applicationCase') or {}
    officers = data.get('officers') or []
    sending_org = data.get('sendingOrg') or {}
    supervising_org = data.get('supervisingOrg') or {}
    plan_type = ac.get('planType') or ''

    paragraphs = doc.paragraphs
    tables = doc.tables

    # ============================================================
    # 第１面
    # ============================================================
    set_paragraph_text(paragraphs[6], f'　　　{format_date_ymd(ac.get("applicationDate"))[0]}年　{format_date_ymd(ac.get("applicationDate"))[1]} 月　{format_date_ymd(ac.get("applicationDate"))[2]}　日')
    set_paragraph_text(paragraphs[8], f'申請者　　{company.get("name", "")}')
    if plan_type in SUPERVISED_TYPES:
        set_paragraph_text(paragraphs[20], f'監理団体　　{supervising_org.get("name", "")}')

    # ============================================================
    # 第２面（table[1]）
    # ============================================================
    pcy, pcm, pcd = format_date_ymd(ac.get('planCreationDate'))
    set_paragraph_text(paragraphs[33], f'作成日：　　{pcy}年　{pcm} 月　{pcd}　日')

    t = tables[1]
    row = lambda r: t.rows[r].cells

    # 1 申請者
    # ②氏名又は名称・④代表者の氏名 は、セル内の1行目が（ふりがな）、
    # 2行目が実際の名称・氏名の行（実物テンプレートを行ごとに検証済み）。
    set_cell_lines(row(0)[10], [str(company.get('companyNo') or '')])
    set_cell_lines(row(2)[10], [company.get('nameKana', ''), company.get('name', '')])
    set_cell_lines(row(3)[10], [])
    fill_address_phone_cell(row(3)[10], company.get('address', ''), company.get('phone', ''))
    set_cell_lines(row(5)[10], ['', company.get('representativeName', '')])
    set_cell_lines(row(6)[10], [company.get('corporateNumber', '')])
    major = f'{company.get("industryMajorCode", "")}　{company.get("industryMajorName", "")}'.strip('　')
    minor = f'{company.get("industryMinorCode", "")}　{company.get("industryMinorName", "")}'.strip('　')
    set_cell_lines(row(20)[10], [f'大分類（{major}）　小分類（{minor}）'])

    # ⑥役員（最大6名、row8-19 の2行ずつ = ①〜⑥）
    for idx in range(6):
        r_name = 8 + idx * 2
        if idx >= len(officers):
            break
        o = officers[idx]
        set_cell_lines(row(r_name)[11], [o.get('name', '')])
        set_cell_lines(row(r_name)[14], [o.get('title', '')])
        postal, street = split_postal_address(o.get('address', ''))
        set_cell_lines(row(r_name)[18], [f'〒　{postal or ""}', street])

    # 2 技能実習を行わせる事業所（受入企業の所在地をそのまま事業所として扱う）
    # ①名称の（ふりがな）は1行上のrow21が別セルとして独立している。
    set_cell_lines(row(21)[10], [company.get('nameKana', '')])
    set_cell_lines(row(22)[10], [company.get('name', '')])
    fill_address_phone_cell(row(23)[10], company.get('address', ''), company.get('phone', ''))
    set_cell_lines(row(24)[10], [company.get('trainingManagerName', '')])
    set_cell_lines(row(26)[10], [company.get('skillInstructor', '')])
    set_cell_lines(row(28)[10], [company.get('lifeInstructor', '')])

    # 3 技能実習生
    set_cell_lines(row(30)[10], [worker.get('name', '')])
    set_cell_lines(row(32)[10], [worker.get('nationality', '')])
    y, m, d = format_date_ymd(worker.get('dob'))
    age = calc_age(worker.get('dob'), ac.get('applicationDate'))
    gender = worker.get('gender', '')
    gender_marked = f'　【男】　・　女　' if gender == '男' else (f'　男　・　【女】　' if gender == '女' else '　男　・　女　')
    set_cell_lines(row(33)[10], [f'　　　{y}年　{m} 月　{d}　日　（　{age}　才）　　性別（{gender_marked}）'])
    cy, cm, cd = format_date_ymd(worker.get('contractStartDate'))
    ey, em, ed = format_date_ymd(worker.get('contractEndDate'))
    set_cell_lines(row(34)[10], [f'　　　年　　　月（{cy}年{cm}月{cd}日　～　{ey}年{em}月{ed}日）'])

    # 4 技能実習の区分
    orig = row(35)[10].text
    marked = mark_checkbox(orig, PLAN_TYPE_LABELS.get(plan_type, '　'), bool(plan_type))
    set_cell_lines(row(35)[10], marked.split('\n'))

    # 5 技能実習の内容
    code = ac.get('jobCategoryCode', '')
    jname = ac.get('jobCategoryName', '')
    wname = ac.get('workName', '')
    set_cell_lines(row(36)[10], [f'コード番号（　{code}　）\n職種名（　{jname}　）　作業名（　{wname}　）'])
    if ac.get('jobCategoryFreeText'):
        set_cell_lines(row(38)[10], [ac.get('jobCategoryFreeText')])

    # 6 技能実習の目標
    goal_lines = row(42)[10].text.split('\n')
    goal_type = ac.get('trainingGoalType', '')
    goal_detail = ac.get('trainingGoalDetail', '')
    if goal_type in ('技能検定', '技能実習評価試験'):
        for i, line in enumerate(goal_lines):
            if goal_type in line:
                line = mark_checkbox(line, goal_type, True)
                # 級：の直後の空欄のみを埋める（試験名は空欄のまま残す）
                line = re.sub(r'(級：)　+）', rf'\1　{goal_detail}　）', line, count=1)
                goal_lines[i] = line
                break
    elif goal_type == 'その他':
        for i, line in enumerate(goal_lines):
            if 'その他' in line:
                line = mark_checkbox(line, 'その他', True)
                line = re.sub(r'（内容：　+）', f'（内容：　{goal_detail}　）', line, count=1)
                goal_lines[i] = line
                break
    set_cell_lines(row(42)[10], goal_lines)

    # 7 前段階の目標の達成状況（2号・3号のみ）
    if plan_type in GEN_2_3_TYPES:
        prior_text = row(44)[10].text
        prior_type = ac.get('priorStageGoalType', '')
        if prior_type in ('技能検定', '技能実習評価試験'):
            prior_text = mark_checkbox(prior_text, prior_type, True)
        set_cell_lines(row(44)[10], prior_text.split('\n'))
        set_cell_lines(row(46)[10], [ac.get('priorApprovalNumber', '')])

    # 8 技能実習の期間及び時間数
    sy, sm, sd = format_date_ymd(ac.get('trainingPeriodStart'))
    tey, tem, ted = format_date_ymd(ac.get('trainingPeriodEnd'))
    ori = ac.get('orientationHours') or ''
    prac = ac.get('practicalHours') or ''
    total = (int(ori) if ori else 0) + (int(prac) if prac else 0)
    set_cell_lines(row(47)[10], [
        f'延べ期間　　　年　　月　　日間',
        f'（{sy}年　{sm} 月　{sd}　日　～　{tey}年　{tem} 月　{ted}　日）',
        f'合計時間　　{total or ""}　時間（入国後講習　{ori}　時間、実習　{prac}　時間）',
    ])

    # 9 団体監理型技能実習（団体監理型のみ）
    if plan_type in SUPERVISED_TYPES:
        set_cell_lines(row(48)[10], [supervising_org.get('licenseNumber', '')])
        lic_text = row(49)[10].text
        lic_marked = mark_checkbox(lic_text, supervising_org.get('licenseType', '一般監理事業'), True)
        set_cell_lines(row(49)[10], lic_marked.split('\n'))
        set_cell_lines(row(50)[10], [supervising_org.get('name', '')])
        fill_address_phone_cell(row(52)[10], f'〒{supervising_org.get("postalCode", "")} {supervising_org.get("address", "")}', supervising_org.get('tel', ''))
        set_cell_lines(row(53)[10], [supervising_org.get('representativeName', '')])
        set_cell_lines(row(55)[10], [supervising_org.get('supervisorName', '')])
        set_cell_lines(row(57)[10], [supervising_org.get('branchName') or supervising_org.get('name', '')])
        branch_addr = supervising_org.get('branchAddress') or supervising_org.get('address', '')
        branch_postal = supervising_org.get('branchPostalCode') or supervising_org.get('postalCode', '')
        branch_tel = supervising_org.get('branchTel') or supervising_org.get('tel', '')
        fill_address_phone_cell(row(59)[10], f'〒{branch_postal} {branch_addr}', branch_tel)
        set_cell_lines(row(60)[10], [ac.get('planGuidanceStaffName', '')])
        set_cell_lines(row(62)[10], [sending_org.get('name', '')])
        # ⑩ 送出機関番号／整理番号
        r63 = row(63)
        set_cell_lines(r63[12] if len(r63) > 12 else r63[10], [sending_org.get('licenseNumber', '')])
        if len(r63) > 25:
            set_cell_lines(r63[25], [sending_org.get('authorizationNumber', '')])

    # 10 技能実習生の待遇
    wage_text = row(64)[10].text
    wage_type = worker.get('wageType', '')
    if wage_type in ('月給', '日給', '時給'):
        wage_text = wage_text.replace(wage_type, f'【{wage_type}】', 1)
    wage_text = wage_text.replace('　　　　　　　　　　　　　　　　　　円', f'{yen(worker.get("baseSalary"))}　円')
    set_cell_lines(row(64)[10], [wage_text])
    set_cell_lines(row(65)[10], [f'{yen(worker.get("trainingAllowance"))}　円'])
    set_cell_lines(row(67)[10], [
        f'期間の定め（有（{cy}年　{cm} 月　{cd}　日　～　{ey}年　{em} 月　{ed}　日）　・　無）'
    ])
    ws = worker.get('workStartTime', '')
    we = worker.get('workEndTime', '')
    bs = worker.get('breakStartTime', '')
    be = worker.get('breakEndTime', '')
    set_cell_lines(row(68)[10], [
        f'　{ws}　　　～　{we}',
        f'（休憩：　{bs}　　　～　{be}）',
    ])
    awh = worker.get('annualWorkingHours') or ''
    wawh = worker.get('weeklyAverageWorkingHours', '')
    set_cell_lines(row(69)[10], [f'　年間　{awh}　時間　／　週平均　{wawh}'])
    set_cell_lines(row(70)[10], [worker.get('holidays', '')])
    set_cell_lines(row(71)[10], [worker.get('leaveInfo', '')])
    set_cell_lines(row(72)[10], [worker.get('dormitoryInfo', '')])
    set_cell_lines(row(73)[10], [
        f'食費　{yen(worker.get("mealFee"))}　円、居住費　{yen(worker.get("housingFeeDeduction"))}　円、その他　{yen(worker.get("otherFeeDeduction"))}　円'
    ])

    # 11 備考
    remarks_text = row(74)[10].text
    diff = ac.get('hasDifficultyNotification', '')
    if diff == '有':
        remarks_text = remarks_text.replace('□　有', '■　有')
    elif diff == '無':
        remarks_text = remarks_text.replace('□　無', '■　無')
    lines = remarks_text.split('\n')
    lines[0] = ac.get('remarks', '') or ''
    set_cell_lines(row(74)[10], lines)

    # ============================================================
    # 第４面（実習実施予定表。1号＝A・Dのみ対象、tables[4]と[5]）
    # ============================================================
    if plan_type in ('A', 'D'):
        fill_page4(paragraphs, tables, company, ac)

    # ============================================================
    # 第７面（欠格事由の確認チェック）
    # ============================================================
    for p in paragraphs:
        if '欠格事由のいずれにも該当しないことを確認しましたので' in p.text:
            set_paragraph_text(p, p.text.replace('□※', '■※'))
            break


def normalize_nulls(obj):
    """DBの未入力欄はJSON上 null になることがあるが、このスクリプトは終始
    「未入力＝空文字列」を前提にしている（.get(key, '') は値が null の場合は
    効かず None のまま通ってしまい、python-docxへの書き込み時にクラッシュする
    ため）。読み込み直後に再帰的に null を '' へ正規化しておく。"""
    if isinstance(obj, dict):
        return {k: normalize_nulls(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize_nulls(v) for v in obj]
    return '' if obj is None else obj


def main():
    if len(sys.argv) != 3:
        print('usage: fill_form.py <input.json> <output.docx>', file=sys.stderr)
        sys.exit(1)
    input_path, output_path = sys.argv[1], sys.argv[2]
    with open(input_path, encoding='utf-8') as f:
        data = normalize_nulls(json.load(f))
    doc = docx.Document(TEMPLATE_PATH)
    fill(doc, data)
    doc.save(output_path)
    print(f'saved: {output_path}')


if __name__ == '__main__':
    main()
