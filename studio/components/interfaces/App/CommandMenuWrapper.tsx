import remarkGfm from 'remark-gfm'
import ReactMarkdown from 'react-markdown'
import { PropsWithChildren } from 'react'
import { useParams } from 'common'
import { CommandMenuProvider } from 'ui'
import { observer } from 'mobx-react-lite'
import { PermissionAction } from '@supabase/shared-types/out/constants'

import { uuidv4 } from 'lib/helpers'
import { checkPermissions, useStore } from 'hooks'
import { createSqlSnippetSkeleton } from '../SQLEditor/SQLEditor.utils'
import { useSqlEditorStateSnapshot } from 'state/sql-editor'
import { useProfileQuery } from 'data/profile/profile-query'
import { SqlSnippet } from 'data/content/sql-snippets-query'
import { useProjectApiQuery } from 'data/config/project-api-query'
import { useEntityDefinitionsQuery } from 'data/database/entity-definitions-query'

const CommandMenuWrapper = observer(({ children }: PropsWithChildren<{}>) => {
  const { ref } = useParams()
  const { ui } = useStore()
  const { opt_in_tags } = ui.selectedOrganization ?? {}

  const snap = useSqlEditorStateSnapshot()
  const isOptedInToAI = opt_in_tags?.includes('AI_SQL_GENERATOR_OPT_IN') ?? false

  const { data: profile } = useProfileQuery()
  const { data: settings } = useProjectApiQuery({ projectRef: ref })
  const canCreateSQLSnippet = checkPermissions(PermissionAction.CREATE, 'user_content', {
    resource: { type: 'sql', owner_id: profile?.id },
    subject: { id: profile?.id },
  })

  const apiKeys = {
    anon: settings?.autoApiService?.defaultApiKey ?? undefined,
    service: settings?.autoApiService?.serviceApiKey ?? undefined,
  }

  const { data } = useEntityDefinitionsQuery(
    {
      projectRef: ui.selectedProject?.ref,
      connectionString: ui.selectedProject?.connectionString,
    },
    { enabled: isOptedInToAI }
  )
  const cmdkMetadata = { definitions: (data ?? []).map((def) => def.sql.trim()).join('\n\n') }

  const onSaveGeneratedSQL = async (answer: string, resolve: any) => {
    if (!ref) return console.error('Project ref is required')
    if (!canCreateSQLSnippet) {
      ui.setNotification({
        category: 'info',
        message: 'Unable to save query as you do not have sufficient permissions for this project',
      })
      return resolve()
    }

    // Remove markdown syntax from returned answer
    answer = answer.replace(/`/g, '').replace(/sql\n/g, '').trim()

    const formattedSql = `
-- Note: This query was generated via Supabase AI, please verify the correctness of the
-- SQL snippet before running it against your database as we are not able to guarantee it
-- will do exactly what you requested the AI.

${answer}
`.trim()

    try {
      const snippet = createSqlSnippetSkeleton({
        name: 'Generated query',
        owner_id: profile?.id,
        sql: formattedSql,
      })
      const data = { ...snippet, id: uuidv4() }
      snap.addSnippet(data as SqlSnippet, ref, true)
      ui.setNotification({
        category: 'success',
        message: `Successfully saved snippet!`,
      })
    } catch (error: any) {
      ui.setNotification({
        category: 'error',
        message: `Failed to create new query: ${error.message}`,
      })
    } finally {
      resolve()
    }
  }

  return (
    <CommandMenuProvider
      site="studio"
      projectRef={ref}
      apiKeys={apiKeys}
      MarkdownHandler={(props) => <ReactMarkdown remarkPlugins={[remarkGfm]} {...props} />}
      onSaveGeneratedSQL={onSaveGeneratedSQL}
      metadata={cmdkMetadata}
      isOptedInToAI={isOptedInToAI}
    >
      {children}
    </CommandMenuProvider>
  )
})

export default CommandMenuWrapper
