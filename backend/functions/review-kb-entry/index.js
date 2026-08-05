// backend/functions/review-kb-entry/index.js
//
// Approves or rejects a pending knowledge-base entry. If the reviewer edits
// the answer while approving, the original pending row is preserved as-is
// (flipped to 'superseded') and a new versioned row is inserted as the live
// approved content — see backend/sql/010_estimate_knowledge_base.sql for why.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    const { id, decision, edited_answer } = JSON.parse(event.body || '{}');

    if (!id || !['approved', 'rejected'].includes(decision)) {
      throw new Error("id and a decision of 'approved' or 'rejected' are required.");
    }

    const supabase = await getSupabaseClient();

    const { data: entry, error: fetchError } = await supabase
      .from('estimate_knowledge_base')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !entry) throw new Error('Knowledge base entry not found.');
    if (entry.status !== 'pending') throw new Error('Only pending entries can be reviewed.');

    const now = new Date().toISOString();
    let result;

    if (decision === 'rejected') {
      const { data, error } = await supabase
        .from('estimate_knowledge_base')
        .update({ status: 'rejected', reviewed_by: flUser.id, reviewed_at: now, updated_at: now })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const answerEdited = typeof edited_answer === 'string' && edited_answer.trim() && edited_answer.trim() !== entry.answer;

      if (answerEdited) {
        const { data: newVersion, error: insertError } = await supabase
          .from('estimate_knowledge_base')
          .insert({
            trade: entry.trade,
            category: entry.category,
            topic: entry.topic,
            answer: edited_answer.trim(),
            source_type: entry.source_type,
            jurisdiction_dependent: entry.jurisdiction_dependent,
            status: 'approved',
            version: entry.version + 1,
            previous_version_id: entry.id,
            created_by: entry.created_by,
            reviewed_by: flUser.id,
            reviewed_at: now,
          })
          .select()
          .single();
        if (insertError) throw insertError;

        const { error: supersedeError } = await supabase
          .from('estimate_knowledge_base')
          .update({ status: 'superseded', reviewed_by: flUser.id, reviewed_at: now, updated_at: now })
          .eq('id', id);
        if (supersedeError) throw supersedeError;

        result = newVersion;
      } else {
        const { data, error } = await supabase
          .from('estimate_knowledge_base')
          .update({ status: 'approved', reviewed_by: flUser.id, reviewed_at: now, updated_at: now })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
    }

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: null,
      action: 'update',
      field_accessed: `estimate_knowledge_base:${id}`,
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
